//! Tauri-free plugin package contract and on-disk storage helpers.
//!
//! Theme packages are deliberately plain data: this module parses and validates
//! their manifests, reads user declarations and the internal lockfile, and scans
//! installed package directories without depending on the app runtime.

use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};

pub use rencal_plugin_contract::{
    Appearance, Contributions, FontContribution, FontStyle, MANIFEST_FILE,
    MIN_PROVIDER_CALDIR_CORE, PluginError, PluginManifest, ProviderContribution, ThemeContribution,
    provider_is_compatible, validate_manifest, validate_manifest_owner, validate_package_id,
    validate_release_tag,
};
use semver::Version;
use serde::{Deserialize, Serialize};
use toml_edit::{Array, Document, Item, Value};

pub(crate) mod installer;

pub use installer::{
    InstalledPlugin, InstalledPlugins, PluginCatalog, PluginCatalogEntry, PluginFontInspection,
    PluginInspection, PluginInstallError, PluginInstallErrorKind, PluginManager,
    PluginReconcileError, PluginThemeInspection,
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

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PluginDeclaration {
    Repository(String),
    Local(PathBuf),
}

impl PluginDeclaration {
    pub fn parse(value: &str) -> Result<Self, PluginError> {
        if value == "~" || value.starts_with("~/") || value.starts_with('/') {
            if value == "~/" {
                return Err(PluginError::new(
                    "local plugin path \"~/\" must name a checkout directory",
                ));
            }
            return expand_home(value).map(Self::Local);
        }
        if value.starts_with("./") || value.starts_with("../") || value.starts_with('~') {
            return Err(PluginError::new(format!(
                "local plugin path {value:?} must be absolute or start with ~/"
            )));
        }
        validate_repository(value)?;
        Ok(Self::Repository(value.to_owned()))
    }
}

impl PluginsFile {
    pub fn declarations(&self) -> Result<Vec<PluginDeclaration>, PluginError> {
        self.plugins
            .iter()
            .map(|value| PluginDeclaration::parse(value))
            .collect()
    }
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct PluginLockFile {
    #[serde(default)]
    pub plugins: Vec<PluginLockEntry>,
    #[serde(default)]
    pub local: Vec<LocalLockEntry>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PluginLockEntry {
    pub id: String,
    pub repo: String,
    pub version: String,
    pub commit: String,
    /// The release the package came from; `None` for a default-branch head.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
    /// Provider binaries installed from `tag`'s release assets.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub providers: Vec<LockedProviderAsset>,
}

/// Pins a provider binary the way `commit` pins package files.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct LockedProviderAsset {
    pub slug: String,
    pub target: String,
    pub asset: String,
    pub sha256: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct LocalLockEntry {
    pub id: String,
    pub dir: String,
}

fn expand_home_with(value: &str, home: &Path) -> Result<PathBuf, PluginError> {
    if value == "~" {
        return Ok(home.to_path_buf());
    }
    if let Some(rest) = value.strip_prefix("~/") {
        if rest.is_empty() {
            return Err(PluginError::new(
                "local plugin path \"~/\" must name a checkout directory",
            ));
        }
        return Ok(home.join(rest));
    }
    let path = PathBuf::from(value);
    if path.is_absolute() {
        return Ok(path);
    }
    Err(PluginError::new(format!(
        "local plugin path {value:?} must be absolute or start with ~/"
    )))
}

pub fn expand_home(value: &str) -> Result<PathBuf, PluginError> {
    let home = dirs::home_dir()
        .ok_or_else(|| PluginError::new("could not resolve user home directory"))?;
    expand_home_with(value, &home)
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
        if let Some(tag) = &entry.tag
            && tag.strip_prefix('v').unwrap_or(tag) != entry.version
        {
            return Err(PluginError::new(format!(
                "plugin tag {tag:?} does not match locked version {:?}",
                entry.version
            )));
        }
        if !entry.providers.is_empty() && entry.tag.is_none() {
            return Err(PluginError::new(format!(
                "plugin {:?} locks provider binaries without a release tag",
                entry.id
            )));
        }
        let mut slugs = HashSet::new();
        for provider in &entry.providers {
            validate_locked_provider(provider)?;
            if !slugs.insert(provider.slug.as_str()) {
                return Err(PluginError::new(format!(
                    "duplicate locked provider {:?}",
                    provider.slug
                )));
            }
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
    let mut local_ids = HashSet::new();
    for entry in &file.local {
        validate_package_id(&entry.id)?;
        if !Path::new(&entry.dir).is_absolute() {
            return Err(PluginError::new(format!(
                "local plugin directory {:?} must be absolute",
                entry.dir
            )));
        }
        if !local_ids.insert(entry.id.to_ascii_lowercase()) {
            return Err(PluginError::new(format!(
                "duplicate local plugin id {:?}",
                entry.id
            )));
        }
    }
    Ok(())
}

fn validate_locked_provider(provider: &LockedProviderAsset) -> Result<(), PluginError> {
    rencal_plugin_contract::validate_provider_slug(&provider.slug)?;
    let valid_target = !provider.target.is_empty()
        && provider.target.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_' || byte == b'-'
        });
    if !valid_target {
        return Err(PluginError::new(format!(
            "locked provider target {:?} is not a target triple",
            provider.target
        )));
    }
    if !provider.asset.ends_with(".tar.gz") || provider.asset.contains(['/', '\\']) {
        return Err(PluginError::new(format!(
            "locked provider asset {:?} must be a .tar.gz file name",
            provider.asset
        )));
    }
    if !is_sha256_hex(&provider.sha256) {
        return Err(PluginError::new(format!(
            "locked provider digest {:?} must be a lowercase sha256",
            provider.sha256
        )));
    }
    Ok(())
}

pub(crate) fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
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
    let mut local_paths = HashSet::new();
    for declaration in file.declarations()? {
        match declaration {
            PluginDeclaration::Repository(repo) => {
                if !repositories.insert(repo.to_ascii_lowercase()) {
                    return Err(PluginError::new(format!(
                        "duplicate plugin repository {repo:?}"
                    )));
                }
            }
            PluginDeclaration::Local(path) => {
                if !local_paths.insert(path.clone()) {
                    return Err(PluginError::new(format!(
                        "duplicate local plugin directory {:?}",
                        path.display().to_string()
                    )));
                }
            }
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
pub struct ScannedProvider {
    pub slug: String,
    pub name: String,
    pub icon: Option<PathBuf>,
    /// `bin/caldir-provider-<slug>` when the package ships one. Local
    /// checkouts may leave it out and use the binary on `PATH`.
    pub binary: Option<PathBuf>,
    /// False once renCal no longer speaks the provider's wire format; the
    /// binary must not be run.
    pub compatible: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScannedPackage {
    pub id: String,
    pub name: String,
    pub version: String,
    pub themes: Vec<ScannedTheme>,
    pub providers: Vec<ScannedProvider>,
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

    let providers = manifest
        .contributes
        .providers
        .iter()
        .map(|provider| {
            let binary = provider_binary_path(directory, &provider.slug);
            ScannedProvider {
                slug: provider.slug.clone(),
                name: provider.name.clone(),
                icon: provider.icon.as_ref().map(|icon| directory.join(icon)),
                binary: binary.is_file().then_some(binary),
                compatible: provider_is_compatible(provider),
            }
        })
        .collect();

    Ok(ScannedPackage {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        themes,
        providers,
    })
}

pub(crate) fn provider_binary_path(package: &Path, slug: &str) -> PathBuf {
    package.join("bin").join(format!("caldir-provider-{slug}"))
}

/// The `bin/` directories of `packages`, scanned from `root`, that renCal may
/// register as providers. The registry takes whole directories, so one
/// incompatible binary keeps the package's other providers out too.
pub fn provider_dirs<'a>(
    root: &Path,
    packages: &'a [ScannedPackage],
) -> Vec<(&'a ScannedPackage, PathBuf)> {
    packages
        .iter()
        .filter(|package| {
            let mut shipped = package
                .providers
                .iter()
                .filter(|provider| provider.binary.is_some())
                .peekable();
            shipped.peek().is_some() && shipped.all(|provider| provider.compatible)
        })
        .map(|package| (package, root.join(&package.id).join("bin")))
        .collect()
}

/// A provider icon as a `data:` URL for an `<img>`, which keeps any script in
/// the SVG inert. Local checkouts skip the installer, so its checks run again.
pub fn provider_icon_data_url(path: &Path) -> Option<String> {
    use base64::Engine;
    use std::io::Read;

    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .ok()?
        .take(installer::ICON_FILE_LIMIT as u64 + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    (bytes.len() <= installer::ICON_FILE_LIMIT && installer::is_svg(&bytes)).then(|| {
        format!(
            "data:image/svg+xml;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        )
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
  '~/dev/rencal-dusk', # Local checkout
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
        assert_eq!(file.plugins.len(), 3);
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
                tag: Some("v1.2.3".into()),
                providers: vec![LockedProviderAsset {
                    slug: "tuta".into(),
                    target: "x86_64-unknown-linux-gnu".into(),
                    asset: "caldir-provider-tuta-x86_64-unknown-linux-gnu.tar.gz".into(),
                    sha256: "a".repeat(64),
                }],
            }],
            local: vec![LocalLockEntry {
                id: "alice.dusk".into(),
                dir: "/home/alice/dev/rencal-dusk".into(),
            }],
        };
        save_plugin_lock_file(&path, &expected).unwrap();
        assert_eq!(load_plugin_lock_file(&path).unwrap(), expected);

        let mut invalid = expected.clone();
        invalid.local[0].dir = "relative/checkout".into();
        assert!(save_plugin_lock_file(&path, &invalid).is_err());
        let mut duplicate = expected.clone();
        duplicate.local.push(expected.local[0].clone());
        assert!(save_plugin_lock_file(&path, &duplicate).is_err());

        let invalid_providers: [fn(&mut PluginLockEntry); 6] = [
            |entry| entry.tag = None,
            |entry| entry.tag = Some("v1.2.4".into()),
            |entry| entry.providers[0].sha256 = "A".repeat(64),
            |entry| entry.providers[0].asset = "../caldir-provider-tuta.tar.gz".into(),
            |entry| entry.providers[0].target = "x86_64/../linux".into(),
            |entry| entry.providers.push(entry.providers[0].clone()),
        ];
        for invalidate in invalid_providers {
            let mut invalid = expected.clone();
            invalidate(&mut invalid.plugins[0]);
            assert!(
                save_plugin_lock_file(&path, &invalid).is_err(),
                "{invalid:?}"
            );
        }
    }

    #[test]
    fn plugin_lock_file_reads_entries_written_before_provider_support() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("plugins.lock");
        let contents = r#"[[plugins]]
id = "alice.dusk"
repo = "Alice/rencal-dusk"
version = "1.2.3"
commit = "1111111111111111111111111111111111111111"
"#;
        std::fs::write(&path, contents).unwrap();

        let locks = load_plugin_lock_file(&path).unwrap();
        assert_eq!(locks.plugins[0].tag, None);
        assert!(locks.plugins[0].providers.is_empty());
        save_plugin_lock_file(&path, &locks).unwrap();
        let saved = std::fs::read_to_string(&path).unwrap();
        assert!(
            !saved.contains("tag") && !saved.contains("providers"),
            "{saved}"
        );
    }

    #[test]
    fn parses_local_and_repository_declarations() {
        assert!(matches!(
            PluginDeclaration::parse("/opt/rencal-dusk").unwrap(),
            PluginDeclaration::Local(_)
        ));
        assert!(matches!(
            PluginDeclaration::parse("alice/dusk").unwrap(),
            PluginDeclaration::Repository(_)
        ));
        for value in ["./dusk", "../dusk", "~alice/dusk", "~/"] {
            assert!(PluginDeclaration::parse(value).is_err(), "{value}");
        }
    }

    #[test]
    fn local_declarations_dedupe_by_expanded_path() {
        let home = Path::new("/home/alice");
        assert_eq!(
            expand_home_with("~/dev/dusk", home).unwrap(),
            Path::new("/home/alice/dev/dusk")
        );
        let file = PluginsFile {
            plugins: vec!["~/dev/dusk".into(), "/home/alice/dev/dusk".into()],
        };
        let expanded: Vec<_> = file
            .plugins
            .iter()
            .map(|value| expand_home_with(value, home).unwrap())
            .collect();
        assert_eq!(expanded[0], expanded[1]);
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

    const PROVIDER_MANIFEST: &str = r#"
id = "alice.tuta"
name = "Tuta"
version = "1.0.0"
description = "Sync Tuta calendars"
min_rencal_version = "0.8.0"

[[contributes.providers]]
slug = "tuta"
name = "Tuta"
icon = "icons/tuta.svg"
asset = "caldir-provider-tuta-{target}.tar.gz"
caldir_core = "0.16.0"
"#;

    #[test]
    fn scan_reports_provider_binaries_without_requiring_them() {
        let temp = tempfile::tempdir().unwrap();
        let package = temp.path().join("alice.tuta");
        std::fs::create_dir_all(&package).unwrap();
        std::fs::write(package.join(MANIFEST_FILE), PROVIDER_MANIFEST).unwrap();

        // A local checkout without bin/ contributes the name and icon only.
        let scan = scan_packages(temp.path(), None);
        assert!(scan.errors.is_empty(), "{:?}", scan.errors);
        let provider = &scan.packages[0].providers[0];
        assert_eq!(provider.slug, "tuta");
        assert_eq!(provider.name, "Tuta");
        assert_eq!(provider.icon, Some(package.join("icons/tuta.svg")));
        assert_eq!(provider.binary, None);
        assert!(provider.compatible);

        let binary = package.join("bin/caldir-provider-tuta");
        std::fs::create_dir_all(binary.parent().unwrap()).unwrap();
        std::fs::write(&binary, "#!/bin/sh\n").unwrap();
        let scan = scan_packages(temp.path(), None);
        assert_eq!(scan.packages[0].providers[0].binary, Some(binary));
    }

    #[test]
    fn scan_flags_providers_built_for_an_older_caldir() {
        let temp = tempfile::tempdir().unwrap();
        let package = temp.path().join("alice.tuta");
        std::fs::create_dir_all(package.join("bin")).unwrap();
        std::fs::write(
            package.join(MANIFEST_FILE),
            PROVIDER_MANIFEST.replacen("0.16.0", "0.11.2", 1),
        )
        .unwrap();
        std::fs::write(package.join("bin/caldir-provider-tuta"), "").unwrap();

        let scan = scan_packages(temp.path(), None);
        assert!(scan.errors.is_empty(), "{:?}", scan.errors);
        let provider = &scan.packages[0].providers[0];
        assert!(!provider.compatible);
        assert!(provider.binary.is_some());
    }

    fn write_provider_package(root: &Path, id: &str, providers: &[(&str, &str, bool)]) {
        let package = root.join(id);
        std::fs::create_dir_all(package.join("bin")).unwrap();
        let mut manifest = format!(
            "id = \"{id}\"\nname = \"{id}\"\nversion = \"1.0.0\"\ndescription = \"Providers\"\n\
             min_rencal_version = \"0.8.0\"\n"
        );
        for (slug, caldir_core, shipped) in providers {
            manifest.push_str(&format!(
                "[[contributes.providers]]\nslug = \"{slug}\"\nname = \"{slug}\"\n\
                 asset = \"caldir-provider-{slug}-{{target}}.tar.gz\"\ncaldir_core = \"{caldir_core}\"\n"
            ));
            if *shipped {
                std::fs::write(provider_binary_path(&package, slug), "").unwrap();
            }
        }
        std::fs::write(package.join(MANIFEST_FILE), manifest).unwrap();
    }

    #[test]
    fn provider_dirs_lists_packages_whose_binaries_are_all_compatible() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        write_provider_package(root, "alice.tuta", &[("tuta", "0.16.0", true)]);
        // Only declared, not shipped: the binary comes from PATH.
        write_provider_package(root, "bob.local", &[("local", "0.16.0", false)]);
        write_provider_package(
            root,
            "carol.mixed",
            &[("fresh", "0.16.0", true), ("stale", "0.11.2", true)],
        );
        // An incompatible contribution without a binary does not matter.
        write_provider_package(
            root,
            "dave.partial",
            &[("partial", "0.16.0", true), ("old", "0.11.2", false)],
        );
        write_provider_package(root, "erin.old", &[("old", "0.11.2", true)]);

        let packages = scan_packages(root, None).packages;
        let dirs: Vec<_> = provider_dirs(root, &packages)
            .into_iter()
            .map(|(package, dir)| (package.id.as_str(), dir))
            .collect();
        assert_eq!(
            dirs,
            [
                ("alice.tuta", root.join("alice.tuta/bin")),
                ("dave.partial", root.join("dave.partial/bin"))
            ]
        );
    }

    #[test]
    fn provider_icons_become_svg_data_urls() {
        let temp = tempfile::tempdir().unwrap();
        let icon = temp.path().join("tuta.svg");
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg"/>"#;

        std::fs::write(&icon, svg).unwrap();
        assert_eq!(
            provider_icon_data_url(&icon).unwrap(),
            "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4="
        );

        for contents in [
            "<html></html>".to_owned(),
            format!("{svg}{}", " ".repeat(64 * 1024)),
        ] {
            std::fs::write(&icon, contents).unwrap();
            assert_eq!(provider_icon_data_url(&icon), None);
        }
        assert_eq!(
            provider_icon_data_url(&temp.path().join("missing.svg")),
            None
        );
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
