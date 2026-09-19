//! Tauri-free plugin package contract and on-disk storage helpers.
//!
//! Theme packages are deliberately plain data: this module parses and validates
//! their manifests, reads `plugins.toml`, and scans installed package directories
//! without depending on the app runtime.

use std::collections::HashSet;
use std::fmt;
use std::io::Write;
use std::path::{Path, PathBuf};

use semver::Version;
use serde::{Deserialize, Serialize};
use specta::Type;

pub const MANIFEST_FILE: &str = "rencal-plugin.toml";

mod installer;

pub use installer::{
    InstalledPlugin, InstalledPlugins, PluginCatalog, PluginCatalogEntry, PluginInspection,
    PluginInstallError, PluginInstallErrorKind, PluginManager, PluginRestoreError,
    PluginThemeInspection,
};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Appearance {
    Light,
    Dark,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ThemeContribution {
    pub id: String,
    pub name: String,
    pub css: String,
    pub appearance: Appearance,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Contributions {
    #[serde(default)]
    pub themes: Vec<ThemeContribution>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub min_rencal_version: String,
    #[serde(default)]
    pub contributes: Contributions,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PluginError(String);

impl PluginError {
    fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl fmt::Display for PluginError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for PluginError {}

/// Parse and validate the shared plugin manifest contract.
///
/// Pass the running app version to enforce compatibility. `None` is useful to
/// indexers, which validate packages independently of a particular installation.
pub fn validate_manifest(
    contents: &str,
    app_version: Option<&Version>,
) -> Result<PluginManifest, PluginError> {
    let value: toml::Value = toml::from_str(contents)
        .map_err(|error| PluginError::new(format!("invalid {MANIFEST_FILE}: {error}")))?;
    reject_unsupported_contributions(&value)?;
    let manifest: PluginManifest = value
        .try_into()
        .map_err(|error| PluginError::new(format!("invalid {MANIFEST_FILE}: {error}")))?;

    validate_package_id(&manifest.id)?;
    if manifest.name.trim().is_empty() {
        return Err(PluginError::new("plugin name must not be empty"));
    }
    if manifest.description.trim().is_empty() {
        return Err(PluginError::new("plugin description must not be empty"));
    }

    Version::parse(&manifest.version).map_err(|error| {
        PluginError::new(format!(
            "plugin version {:?} is not semantic: {error}",
            manifest.version
        ))
    })?;
    let minimum = Version::parse(&manifest.min_rencal_version).map_err(|error| {
        PluginError::new(format!(
            "min_rencal_version {:?} is not semantic: {error}",
            manifest.min_rencal_version
        ))
    })?;
    if let Some(current) = app_version
        && current < &minimum
    {
        return Err(PluginError::new(format!(
            "requires renCal {minimum} or newer (running {current})"
        )));
    }

    if manifest.contributes.themes.is_empty() {
        return Err(PluginError::new(
            "unsupported package: at least one theme contribution is required",
        ));
    }

    let mut theme_ids = HashSet::new();
    for theme in &manifest.contributes.themes {
        validate_contribution_id(&theme.id)?;
        if !theme_ids.insert(&theme.id) {
            return Err(PluginError::new(format!(
                "duplicate theme contribution id {:?}",
                theme.id
            )));
        }
        if theme.name.trim().is_empty() {
            return Err(PluginError::new(format!(
                "theme {:?} name must not be empty",
                theme.id
            )));
        }
        validate_css_path(&theme.css)?;
    }

    Ok(manifest)
}

/// Verify the package owner against the GitHub repository owner.
pub fn validate_manifest_owner(
    manifest: &PluginManifest,
    repository_owner: &str,
) -> Result<(), PluginError> {
    validate_package_id(&manifest.id)?;
    let owner = manifest.id.split_once('.').expect("validated plugin id").0;
    if !owner.eq_ignore_ascii_case(repository_owner) {
        return Err(PluginError::new(format!(
            "plugin id owner {owner:?} does not match repository owner {repository_owner:?}"
        )));
    }
    Ok(())
}

/// Releases may prefix the semantic version with `v`, but must otherwise match.
pub fn validate_release_tag(manifest: &PluginManifest, tag: &str) -> Result<(), PluginError> {
    if tag.strip_prefix('v').unwrap_or(tag) != manifest.version {
        return Err(PluginError::new(format!(
            "release tag {tag:?} does not match manifest version {:?}",
            manifest.version
        )));
    }
    Ok(())
}

fn reject_unsupported_contributions(value: &toml::Value) -> Result<(), PluginError> {
    let Some(table) = value.as_table() else {
        return Err(PluginError::new(format!(
            "invalid {MANIFEST_FILE}: expected a TOML table"
        )));
    };
    for key in ["app", "provider", "theme"] {
        if table.contains_key(key) {
            return Err(PluginError::new(format!(
                "unsupported package contribution {key:?}"
            )));
        }
    }
    if let Some(contributes) = table.get("contributes").and_then(toml::Value::as_table) {
        for key in contributes.keys() {
            if key != "themes" {
                return Err(PluginError::new(format!(
                    "unsupported package contribution {:?}",
                    format!("contributes.{key}")
                )));
            }
        }
    }
    Ok(())
}

fn validate_package_id(id: &str) -> Result<(), PluginError> {
    let Some((owner, name)) = id.split_once('.') else {
        return Err(PluginError::new(
            "plugin id must be lowercase <github-owner>.<name>",
        ));
    };
    if name.contains('.')
        || !valid_slug(owner)
        || !valid_slug(name)
        || id.bytes().any(|byte| byte.is_ascii_uppercase())
    {
        return Err(PluginError::new(
            "plugin id must be lowercase <github-owner>.<name> using a-z, 0-9, and hyphens",
        ));
    }
    if owner == "rencal" {
        return Err(PluginError::new(
            "plugin ids beginning with rencal. are reserved",
        ));
    }
    Ok(())
}

fn validate_contribution_id(id: &str) -> Result<(), PluginError> {
    if !valid_slug(id) || id.bytes().any(|byte| byte.is_ascii_uppercase()) {
        return Err(PluginError::new(format!(
            "theme contribution id {id:?} must use lowercase a-z, 0-9, and hyphens"
        )));
    }
    Ok(())
}

fn valid_slug(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn validate_css_path(path: &str) -> Result<(), PluginError> {
    let safe = !path.is_empty()
        && !path.starts_with('/')
        && !path.contains('\\')
        && !path.contains(':')
        && path.ends_with(".css")
        && path
            .split('/')
            .all(|component| !component.is_empty() && component != "." && component != "..");
    if !safe {
        return Err(PluginError::new(format!(
            "theme CSS path {path:?} must be a relative .css path within the package"
        )));
    }
    Ok(())
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginsFile {
    #[serde(default)]
    pub plugins: Vec<PluginEntry>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginEntry {
    pub id: String,
    pub repo: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

pub fn load_plugins_file(path: &Path) -> Result<PluginsFile, PluginError> {
    let contents = match std::fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(PluginsFile::default());
        }
        Err(error) => {
            return Err(PluginError::new(format!(
                "could not read {}: {error}",
                path.display()
            )));
        }
    };
    let file: PluginsFile = toml::from_str(&contents).map_err(|error| {
        PluginError::new(format!("could not parse {}: {error}", path.display()))
    })?;
    validate_plugins_file(&file)?;
    Ok(file)
}

pub fn save_plugins_file(path: &Path, file: &PluginsFile) -> Result<(), PluginError> {
    // Never turn a broken, hand-edited declarations file into valid defaults.
    // Callers must surface the parse error and leave the user's file untouched.
    if path.exists() {
        load_plugins_file(path)?;
    }
    validate_plugins_file(file)?;
    let contents = toml::to_string_pretty(file)
        .map_err(|error| PluginError::new(format!("could not serialize plugins.toml: {error}")))?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            PluginError::new(format!("could not create {}: {error}", parent.display()))
        })?;
    }
    // Keep dotfile-manager symlinks intact while still replacing the actual
    // declarations file atomically.
    let destination = match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            std::fs::canonicalize(path).map_err(|error| {
                PluginError::new(format!(
                    "could not resolve plugins.toml symlink {}: {error}",
                    path.display()
                ))
            })?
        }
        _ => path.to_path_buf(),
    };
    let parent = destination.parent().ok_or_else(|| {
        PluginError::new(format!("{} has no parent directory", destination.display()))
    })?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|error| {
        PluginError::new(format!(
            "could not create temporary plugins.toml beside {}: {error}",
            path.display()
        ))
    })?;
    temporary.write_all(contents.as_bytes()).map_err(|error| {
        PluginError::new(format!("could not write temporary plugins.toml: {error}"))
    })?;
    temporary.as_file().sync_all().map_err(|error| {
        PluginError::new(format!("could not sync temporary plugins.toml: {error}"))
    })?;
    temporary.persist(&destination).map_err(|error| {
        PluginError::new(format!(
            "could not replace {}: {}",
            destination.display(),
            error.error
        ))
    })?;
    Ok(())
}

fn validate_plugins_file(file: &PluginsFile) -> Result<(), PluginError> {
    let mut ids = HashSet::new();
    for entry in &file.plugins {
        validate_package_id(&entry.id)?;
        if !ids.insert(&entry.id) {
            return Err(PluginError::new(format!(
                "duplicate plugin entry {:?}",
                entry.id
            )));
        }
        let Some((owner, repo)) = entry.repo.split_once('/') else {
            return Err(PluginError::new(format!(
                "plugin repo {:?} must be owner/repo",
                entry.repo
            )));
        };
        if owner.is_empty() || repo.is_empty() || repo.contains('/') {
            return Err(PluginError::new(format!(
                "plugin repo {:?} must be owner/repo",
                entry.repo
            )));
        }
        validate_manifest_owner_for_id(&entry.id, owner)?;
        if let Some(version) = &entry.version {
            Version::parse(version).map_err(|error| {
                PluginError::new(format!(
                    "plugin version {version:?} is not semantic: {error}"
                ))
            })?;
        }
    }
    Ok(())
}

fn validate_manifest_owner_for_id(id: &str, repository_owner: &str) -> Result<(), PluginError> {
    let owner = id.split_once('.').expect("validated plugin id").0;
    if !owner.eq_ignore_ascii_case(repository_owner) {
        return Err(PluginError::new(format!(
            "plugin id owner {owner:?} does not match repository owner {repository_owner:?}"
        )));
    }
    Ok(())
}

pub fn plugins_file_path() -> Result<PathBuf, PluginError> {
    dirs::config_dir()
        .map(|path| path.join("rencal/plugins.toml"))
        .ok_or_else(|| PluginError::new("could not resolve user config directory"))
}

pub fn plugins_dir() -> Result<PathBuf, PluginError> {
    dirs::data_local_dir()
        .map(|path| path.join("rencal/plugins"))
        .ok_or_else(|| PluginError::new("could not resolve user data directory"))
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScannedTheme {
    pub id: String,
    pub name: String,
    pub css: String,
    pub appearance: Appearance,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScannedPackage {
    pub id: String,
    pub name: String,
    pub version: String,
    pub themes: Vec<ScannedTheme>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PackageScanError {
    pub package: String,
    pub message: String,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PackageScan {
    pub packages: Vec<ScannedPackage>,
    pub errors: Vec<PackageScanError>,
}

/// Scan every immediate child directory as one installed plugin package.
pub fn scan_packages(root: &Path, app_version: Option<&Version>) -> PackageScan {
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return PackageScan::default();
        }
        Err(error) => {
            return PackageScan {
                packages: Vec::new(),
                errors: vec![PackageScanError {
                    package: root.display().to_string(),
                    message: format!("could not scan plugin directory: {error}"),
                }],
            };
        }
    };

    let mut directories: Vec<_> = entries
        .flatten()
        .filter(|entry| {
            entry.file_type().is_ok_and(|kind| kind.is_dir())
                && !entry.file_name().to_string_lossy().starts_with('.')
        })
        .collect();
    directories.sort_by_key(std::fs::DirEntry::file_name);

    let mut scan = PackageScan::default();
    for entry in directories {
        let directory = entry.path();
        let package = entry.file_name().to_string_lossy().into_owned();
        match scan_package(&directory, &package, app_version) {
            Ok(installed) => scan.packages.push(installed),
            Err(error) => scan.errors.push(PackageScanError {
                package,
                message: error.to_string(),
            }),
        }
    }
    scan
}

fn scan_package(
    directory: &Path,
    directory_name: &str,
    app_version: Option<&Version>,
) -> Result<ScannedPackage, PluginError> {
    let manifest_path = directory.join(MANIFEST_FILE);
    let contents = std::fs::read_to_string(&manifest_path).map_err(|error| {
        PluginError::new(format!(
            "could not read {}: {error}",
            manifest_path.display()
        ))
    })?;
    let manifest = validate_manifest(&contents, app_version)?;
    if manifest.id != directory_name {
        return Err(PluginError::new(format!(
            "manifest id {:?} does not match package directory {directory_name:?}",
            manifest.id
        )));
    }

    let mut themes = Vec::with_capacity(manifest.contributes.themes.len());
    for theme in manifest.contributes.themes {
        let css_path = directory.join(&theme.css);
        let css = std::fs::read_to_string(&css_path).map_err(|error| {
            PluginError::new(format!("could not read {}: {error}", css_path.display()))
        })?;
        themes.push(ScannedTheme {
            id: format!("{}/{}", manifest.id, theme.id),
            name: theme.name,
            css,
            appearance: theme.appearance,
        });
    }

    Ok(ScannedPackage {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        themes,
    })
}

/// Release builds replace the repository's placeholder Cargo version. During
/// local development, skip the compatibility gate so current package fixtures
/// can be exercised before the next release number is written by CI.
pub fn running_app_version() -> Option<Version> {
    let version = Version::parse(env!("CARGO_PKG_VERSION")).expect("Cargo package version");
    (version != Version::new(0, 0, 1)).then_some(version)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MANIFEST: &str = r#"
id = "alice.dusk"
name = "Dusk"
version = "1.2.3"
description = "A quiet theme"
min_rencal_version = "0.8.0"

[[contributes.themes]]
id = "dark"
name = "Dusk Dark"
css = "themes/dark.css"
appearance = "dark"
"#;

    #[test]
    fn validates_manifest_ids_versions_owner_and_paths() {
        let manifest = validate_manifest(MANIFEST, Some(&Version::new(0, 9, 0))).unwrap();
        assert_eq!(manifest.id, "alice.dusk");
        assert!(validate_manifest_owner(&manifest, "Alice").is_ok());
        assert!(validate_manifest_owner(&manifest, "bob").is_err());
        assert!(validate_release_tag(&manifest, "v1.2.3").is_ok());
        assert!(validate_release_tag(&manifest, "1.2.4").is_err());

        for (from, to) in [
            ("alice.dusk", "Alice.dusk"),
            ("alice.dusk", "rencal.dusk"),
            ("id = \"dark\"", "id = \"Dark\""),
            ("themes/dark.css", "../dark.css"),
            ("themes/dark.css", "/dark.css"),
            ("themes/dark.css", "themes\\dark.css"),
            ("version = \"1.2.3\"", "version = \"latest\""),
        ] {
            assert!(
                validate_manifest(&MANIFEST.replacen(from, to, 1), None).is_err(),
                "expected replacement {from:?} -> {to:?} to be rejected"
            );
        }
    }

    #[test]
    fn rejects_incompatible_and_unsupported_packages() {
        let incompatible = validate_manifest(MANIFEST, Some(&Version::new(0, 7, 9)))
            .unwrap_err()
            .to_string();
        assert!(incompatible.contains("requires renCal 0.8.0"));

        let mixed = format!("{MANIFEST}\n[app]\nmain = \"main.js\"\n");
        let error = validate_manifest(&mixed, None).unwrap_err().to_string();
        assert!(error.contains("unsupported package contribution \"app\""));
    }

    #[test]
    fn plugins_file_round_trips_and_malformed_input_is_preserved() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("config/plugins.toml");
        let expected = PluginsFile {
            plugins: vec![PluginEntry {
                id: "alice.dusk".into(),
                repo: "Alice/rencal-dusk".into(),
                version: Some("1.2.3".into()),
            }],
        };
        save_plugins_file(&path, &expected).unwrap();
        assert_eq!(load_plugins_file(&path).unwrap(), expected);

        std::fs::write(&path, "[[plugins]\nid = [").unwrap();
        let before = std::fs::read_to_string(&path).unwrap();
        assert!(load_plugins_file(&path).is_err());
        assert!(save_plugins_file(&path, &PluginsFile::default()).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), before);
    }

    #[cfg(unix)]
    #[test]
    fn atomic_save_preserves_a_dotfiles_symlink() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().unwrap();
        let dotfiles = temp.path().join("dotfiles/plugins.toml");
        std::fs::create_dir_all(dotfiles.parent().unwrap()).unwrap();
        std::fs::write(&dotfiles, "plugins = []\n").unwrap();
        let path = temp.path().join("config/plugins.toml");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        symlink(&dotfiles, &path).unwrap();

        let expected = PluginsFile {
            plugins: vec![PluginEntry {
                id: "alice.dusk".into(),
                repo: "Alice/rencal-dusk".into(),
                version: Some("1.2.3".into()),
            }],
        };
        save_plugins_file(&path, &expected).unwrap();

        assert!(
            std::fs::symlink_metadata(&path)
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert_eq!(load_plugins_file(&path).unwrap(), expected);
        assert_eq!(load_plugins_file(&dotfiles).unwrap(), expected);
    }

    #[test]
    fn scan_keeps_valid_packages_when_another_is_invalid() {
        let temp = tempfile::tempdir().unwrap();
        let valid = temp.path().join("alice.dusk");
        std::fs::create_dir_all(valid.join("themes")).unwrap();
        std::fs::write(valid.join(MANIFEST_FILE), MANIFEST).unwrap();
        std::fs::write(valid.join("themes/dark.css"), "--background: #111;").unwrap();

        let invalid = temp.path().join("bob.broken");
        std::fs::create_dir_all(&invalid).unwrap();
        std::fs::write(invalid.join(MANIFEST_FILE), "not toml").unwrap();

        let scan = scan_packages(temp.path(), Some(&Version::new(0, 9, 0)));
        assert_eq!(scan.packages.len(), 1);
        assert_eq!(scan.packages[0].themes[0].id, "alice.dusk/dark");
        assert_eq!(scan.packages[0].themes[0].appearance, Appearance::Dark);
        assert_eq!(scan.errors.len(), 1);
        assert_eq!(scan.errors[0].package, "bob.broken");
    }
}
