//! Tauri-free plugin package contract and on-disk storage helpers.
//!
//! Theme packages are deliberately plain data: this module parses and validates
//! their manifests, reads user declarations and the internal lockfile, and scans
//! installed package directories without depending on the app runtime.

use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};

pub use rencal_plugin_contract::{
    Appearance, Contributions, MANIFEST_FILE, PluginError, PluginManifest, ThemeContribution,
    validate_manifest, validate_manifest_owner, validate_package_id, validate_release_tag,
};
use semver::Version;
use serde::{Deserialize, Serialize};
use toml_edit::{Array, Document, Item, Value};

mod installer;

pub use installer::{
    InstalledPlugin, InstalledPlugins, PluginCatalog, PluginCatalogEntry, PluginInspection,
    PluginInstallError, PluginInstallErrorKind, PluginManager, PluginReconcileError,
    PluginThemeInspection,
};

/// Validate a GitHub repository reference and return its canonical owner/name form.
pub(crate) fn normalize_repository(value: &str) -> Result<String, PluginInstallError> {
    installer::normalize_repository(value)
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct PluginsFile {
    #[serde(default)]
    pub plugins: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct PluginLockFile {
    #[serde(default)]
    pub plugins: Vec<PluginLockEntry>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PluginLockEntry {
    pub id: String,
    pub repo: String,
    pub version: String,
    pub commit: String,
}

pub fn load_plugins_file(path: &Path) -> Result<PluginsFile, PluginError> {
    parse_plugins_file(path, &read_plugins_file(path)?)
}

fn read_plugins_file(path: &Path) -> Result<String, PluginError> {
    match std::fs::read_to_string(path) {
        Ok(contents) => Ok(contents),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(PluginError::new(format!(
            "could not read {}: {error}",
            path.display()
        ))),
    }
}

fn parse_plugins_file(path: &Path, contents: &str) -> Result<PluginsFile, PluginError> {
    let file: PluginsFile = toml::from_str(contents).map_err(|error| {
        PluginError::new(format!("could not parse {}: {error}", path.display()))
    })?;
    validate_plugins_file(&file)?;
    Ok(file)
}

pub fn save_plugins_file(path: &Path, file: &PluginsFile) -> Result<(), PluginError> {
    // Never turn a broken, hand-edited declarations file into valid defaults.
    // Callers must surface the parse error and leave the user's file untouched.
    let contents = read_plugins_file(path)?;
    parse_plugins_file(path, &contents)?;
    validate_plugins_file(file)?;
    let mut document: Document = contents.parse().map_err(|error| {
        PluginError::new(format!("could not parse {}: {error}", path.display()))
    })?;
    update_plugins_document(&mut document, file);
    write_atomic(
        path,
        document.to_string().as_bytes(),
        "plugins.toml",
        true,
        0o644,
    )
}

pub fn load_plugin_lock_file(path: &Path) -> Result<PluginLockFile, PluginError> {
    let contents = read_plugins_file(path)?;
    let file: PluginLockFile = toml::from_str(&contents).map_err(|error| {
        PluginError::new(format!("could not parse {}: {error}", path.display()))
    })?;
    validate_plugin_lock_file(&file)?;
    Ok(file)
}

pub fn save_plugin_lock_file(path: &Path, file: &PluginLockFile) -> Result<(), PluginError> {
    validate_plugin_lock_file(file)?;
    let contents = toml::to_string_pretty(file).map_err(|error| {
        PluginError::new(format!("could not serialize plugin lockfile: {error}"))
    })?;
    write_atomic(path, contents.as_bytes(), "plugins.lock", false, 0o600)
}

fn write_atomic(
    path: &Path,
    contents: &[u8],
    label: &str,
    follow_symlink: bool,
    new_file_mode: u32,
) -> Result<(), PluginError> {
    #[cfg(not(unix))]
    let _ = new_file_mode;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            PluginError::new(format!("could not create {}: {error}", parent.display()))
        })?;
    }
    // Keep dotfile-manager symlinks intact while still replacing the actual
    // declarations file atomically.
    let destination = match std::fs::symlink_metadata(path) {
        Ok(metadata) if follow_symlink && metadata.file_type().is_symlink() => {
            std::fs::canonicalize(path).map_err(|error| {
                PluginError::new(format!(
                    "could not resolve {label} symlink {}: {error}",
                    path.display()
                ))
            })?
        }
        _ => path.to_path_buf(),
    };
    let parent = destination.parent().ok_or_else(|| {
        PluginError::new(format!("{} has no parent directory", destination.display()))
    })?;

    #[cfg(unix)]
    let destination_mode = match std::fs::metadata(&destination) {
        Ok(metadata) => {
            use std::os::unix::fs::PermissionsExt;
            metadata.permissions().mode()
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => new_file_mode,
        Err(error) => {
            return Err(PluginError::new(format!(
                "could not read permissions for {}: {error}",
                destination.display()
            )));
        }
    };

    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|error| {
        PluginError::new(format!(
            "could not create temporary {label} beside {}: {error}",
            path.display()
        ))
    })?;
    temporary
        .write_all(contents)
        .map_err(|error| PluginError::new(format!("could not write temporary {label}: {error}")))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = std::fs::Permissions::from_mode(destination_mode);
        temporary
            .as_file()
            .set_permissions(permissions)
            .map_err(|error| {
                PluginError::new(format!(
                    "could not set temporary {label} permissions: {error}"
                ))
            })?;
    }
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| PluginError::new(format!("could not sync temporary {label}: {error}")))?;
    temporary.persist(&destination).map_err(|error| {
        PluginError::new(format!(
            "could not replace {}: {}",
            destination.display(),
            error.error
        ))
    })?;
    Ok(())
}

fn validate_plugin_lock_file(file: &PluginLockFile) -> Result<(), PluginError> {
    let mut ids = HashSet::new();
    let mut repositories = HashSet::new();
    for entry in &file.plugins {
        validate_package_id(&entry.id)?;
        let owner = validate_repository(&entry.repo)?;
        validate_manifest_owner_for_id(&entry.id, owner)?;
        Version::parse(&entry.version).map_err(|error| {
            PluginError::new(format!(
                "plugin version {:?} is not semantic: {error}",
                entry.version
            ))
        })?;
        if entry.commit.len() != 40
            || !entry
                .commit
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        {
            return Err(PluginError::new(format!(
                "plugin commit {:?} must be a lowercase 40-character SHA",
                entry.commit
            )));
        }
        if !ids.insert(entry.id.to_ascii_lowercase()) {
            return Err(PluginError::new(format!(
                "duplicate locked plugin id {:?}",
                entry.id
            )));
        }
        if !repositories.insert(entry.repo.to_ascii_lowercase()) {
            return Err(PluginError::new(format!(
                "duplicate locked plugin repository {:?}",
                entry.repo
            )));
        }
    }
    Ok(())
}

fn update_plugins_document(document: &mut Document, file: &PluginsFile) {
    let mut remaining: Vec<_> = file.plugins.iter().map(String::as_str).collect();

    // Keep comments and spelling on existing repository strings.
    if let Some(array) = document.get_mut("plugins").and_then(Item::as_array_mut) {
        let mut index = 0;
        while index < array.len() {
            let repo = array
                .get(index)
                .and_then(Value::as_str)
                .expect("validated plugin repository");
            if let Some(remaining_index) = remaining.iter().position(|candidate| *candidate == repo)
            {
                remaining.remove(remaining_index);
                index += 1;
            } else {
                array.remove(index);
            }
        }
        for repo in remaining {
            array.push(repo);
        }
        return;
    }

    if document.get("plugins").is_none() && file.plugins.is_empty() {
        return;
    }
    let mut array = Array::new();
    for repo in &file.plugins {
        array.push(repo.as_str());
    }
    document["plugins"] = Item::Value(Value::Array(array));
}

fn validate_plugins_file(file: &PluginsFile) -> Result<(), PluginError> {
    let mut repositories = HashSet::new();
    for repo in &file.plugins {
        validate_repository(repo)?;
        if !repositories.insert(repo.to_ascii_lowercase()) {
            return Err(PluginError::new(format!(
                "duplicate plugin repository {repo:?}"
            )));
        }
    }
    Ok(())
}

fn validate_repository(repo: &str) -> Result<&str, PluginError> {
    let Some((owner, name)) = repo.split_once('/') else {
        return Err(PluginError::new(format!(
            "plugin repository {repo:?} must be owner/repo"
        )));
    };
    if owner.is_empty() || name.is_empty() || name.contains('/') {
        return Err(PluginError::new(format!(
            "plugin repository {repo:?} must be owner/repo"
        )));
    }
    Ok(owner)
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

pub fn plugins_lock_path() -> Result<PathBuf, PluginError> {
    dirs::data_local_dir()
        .map(|path| path.join("rencal/plugins.lock"))
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
            entry.path().is_dir() && !entry.file_name().to_string_lossy().starts_with('.')
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

        let unsupported_kind = format!("{MANIFEST}\n[contributes.icons]\n");
        let error = validate_manifest(&unsupported_kind, None)
            .unwrap_err()
            .to_string();
        assert!(error.contains("unsupported package contribution \"contributes.icons\""));
    }

    #[test]
    fn tolerates_future_metadata_and_reports_newer_version_first() {
        let with_future_metadata = MANIFEST
            .replacen(
                "name = \"Dusk\"",
                "name = \"Dusk\"\nhomepage = \"https://example.com\"\nlicense = \"MIT\"",
                1,
            )
            .replacen(
                "appearance = \"dark\"",
                "appearance = \"dark\"\npreview = \"themes/dark.png\"",
                1,
            );
        assert!(validate_manifest(&with_future_metadata, None).is_ok());

        let from_newer_rencal = MANIFEST.replacen("0.8.0", "9.0.0", 1).replacen(
            "appearance = \"dark\"",
            "appearance = \"adaptive\"",
            1,
        );
        let error = validate_manifest(&from_newer_rencal, Some(&Version::new(0, 9, 0)))
            .unwrap_err()
            .to_string();
        assert!(error.contains("requires renCal 9.0.0"), "{error}");
    }

    #[test]
    fn plugins_file_round_trips_and_malformed_input_is_preserved() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("config/plugins.toml");
        let expected = PluginsFile {
            plugins: vec!["Alice/rencal-dusk".into()],
        };
        save_plugins_file(&path, &expected).unwrap();
        assert_eq!(load_plugins_file(&path).unwrap(), expected);

        std::fs::write(&path, "plugins = [").unwrap();
        let before = std::fs::read_to_string(&path).unwrap();
        assert!(load_plugins_file(&path).is_err());
        assert!(save_plugins_file(&path, &PluginsFile::default()).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), before);
    }

    #[cfg(unix)]
    #[test]
    fn plugins_file_is_world_readable_when_created() {
        use std::os::unix::fs::PermissionsExt;

        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("config/plugins.toml");
        save_plugins_file(&path, &PluginsFile::default()).unwrap();

        let mode = std::fs::metadata(path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o644);
    }

    #[cfg(unix)]
    #[test]
    fn plugins_file_save_preserves_existing_mode() {
        use std::os::unix::fs::PermissionsExt;

        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("plugins.toml");
        std::fs::write(&path, "plugins = []\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o640)).unwrap();

        save_plugins_file(&path, &PluginsFile::default()).unwrap();

        let mode = std::fs::metadata(path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o640);
    }

    const FUTURE_PLUGINS: &str = r#"# Synced between machines
schema = 2 # Written by a newer renCal
plugins = [
  'Alice/rencal-dusk', # My preferred theme
  'bob/rencal-dawn',
]

[sync]
machine = 'laptop' # Future top-level metadata
"#;

    #[test]
    fn plugins_file_preserves_future_fields_and_formatting_on_noop_save() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("plugins.toml");
        std::fs::write(&path, FUTURE_PLUGINS).unwrap();

        let file = load_plugins_file(&path).unwrap();
        assert_eq!(file.plugins.len(), 2);
        save_plugins_file(&path, &file).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), FUTURE_PLUGINS);
    }

    #[test]
    fn plugins_file_adds_and_removes_entries_without_losing_other_metadata() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("plugins.toml");
        std::fs::write(&path, FUTURE_PLUGINS).unwrap();

        let mut file = load_plugins_file(&path).unwrap();
        file.plugins.pop();
        file.plugins.push("carol/rencal-noon".into());
        save_plugins_file(&path, &file).unwrap();
        assert_eq!(load_plugins_file(&path).unwrap(), file);
        let contents = std::fs::read_to_string(&path).unwrap();
        assert!(contents.contains("'Alice/rencal-dusk'"));
        assert!(contents.contains("\"carol/rencal-noon\""));
        assert!(contents.contains("[sync]\nmachine = 'laptop' # Future top-level metadata\n"));
        assert!(!contents.contains("bob/rencal-dawn"));

        save_plugins_file(&path, &PluginsFile::default()).unwrap();
        assert_eq!(load_plugins_file(&path).unwrap(), PluginsFile::default());
        let contents = std::fs::read_to_string(&path).unwrap();
        assert!(contents.contains("schema = 2 # Written by a newer renCal"));
        assert!(contents.contains("[sync]\nmachine = 'laptop' # Future top-level metadata"));
    }

    #[test]
    fn plugins_file_still_rejects_invalid_known_fields_without_overwriting() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("plugins.toml");
        for contents in [
            "plugins = ['alice']\n",
            "plugins = ['alice/dusk/more']\n",
            "plugins = [42]\n",
            "plugins = ['alice/dusk', 'ALICE/DUSK']\n",
            "[[plugins]]\nrepo = 'alice/dusk'\n",
        ] {
            std::fs::write(&path, contents).unwrap();
            assert!(load_plugins_file(&path).is_err(), "{contents}");
            assert!(save_plugins_file(&path, &PluginsFile::default()).is_err());
            assert_eq!(std::fs::read_to_string(&path).unwrap(), contents);
        }
    }

    #[cfg(unix)]
    #[test]
    fn atomic_save_preserves_a_dotfiles_symlink() {
        use std::os::unix::fs::{PermissionsExt, symlink};

        let temp = tempfile::tempdir().unwrap();
        let dotfiles = temp.path().join("dotfiles/plugins.toml");
        std::fs::create_dir_all(dotfiles.parent().unwrap()).unwrap();
        std::fs::write(&dotfiles, "plugins = []\n").unwrap();
        std::fs::set_permissions(&dotfiles, std::fs::Permissions::from_mode(0o640)).unwrap();
        let path = temp.path().join("config/plugins.toml");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        symlink(&dotfiles, &path).unwrap();

        let expected = PluginsFile {
            plugins: vec!["Alice/rencal-dusk".into()],
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
        assert_eq!(
            std::fs::metadata(&dotfiles).unwrap().permissions().mode() & 0o777,
            0o640
        );
    }

    #[test]
    fn plugin_lock_file_round_trips_and_validates_resolved_metadata() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("data/plugins.lock");
        let expected = PluginLockFile {
            plugins: vec![PluginLockEntry {
                id: "alice.dusk".into(),
                repo: "Alice/rencal-dusk".into(),
                version: "1.2.3".into(),
                commit: "1111111111111111111111111111111111111111".into(),
            }],
        };
        save_plugin_lock_file(&path, &expected).unwrap();
        assert_eq!(load_plugin_lock_file(&path).unwrap(), expected);
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

    #[cfg(unix)]
    #[test]
    fn scan_follows_symlinked_package_directories() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().unwrap();
        let plugins = temp.path().join("plugins");
        let checkout = temp.path().join("checkout");
        std::fs::create_dir_all(checkout.join("themes")).unwrap();
        std::fs::write(checkout.join(MANIFEST_FILE), MANIFEST).unwrap();
        std::fs::write(checkout.join("themes/dark.css"), "--background: #111;").unwrap();
        std::fs::create_dir(&plugins).unwrap();
        symlink(&checkout, plugins.join("alice.dusk")).unwrap();

        let scan = scan_packages(&plugins, Some(&Version::new(0, 9, 0)));

        assert!(scan.errors.is_empty(), "{:?}", scan.errors);
        assert_eq!(scan.packages.len(), 1);
        assert_eq!(scan.packages[0].id, "alice.dusk");
        assert_eq!(scan.packages[0].themes[0].id, "alice.dusk/dark");
    }
}
