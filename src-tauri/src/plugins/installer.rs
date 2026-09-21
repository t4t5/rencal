//! GitHub-backed installation for data-only theme packages.
//!
//! Downloads are bounded and written to a staging directory. Package swaps,
//! declarations, and lockfile updates are serialized so a failed install or
//! update can put the previous state back before returning.

use std::collections::HashSet;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;

use futures_util::StreamExt;
use reqwest::{StatusCode, Url};
use semver::Version;
use serde::{Deserialize, Serialize};
use specta::Type;
use tokio::sync::Mutex;

#[cfg(unix)]
use super::LocalLockEntry;
use super::{
    Appearance, FontStyle, MANIFEST_FILE, PluginDeclaration, PluginLockEntry, PluginLockFile,
    PluginManifest, PluginsFile, load_plugin_lock_file, load_plugins_file, plugins_dir,
    plugins_file_path, plugins_lock_path, running_app_version, save_plugin_lock_file,
    save_plugins_file, scan_packages, validate_manifest, validate_manifest_owner,
    validate_package_id, validate_release_tag,
};

const RELEASE_RESPONSE_LIMIT: usize = 1024 * 1024;
const MANIFEST_LIMIT: usize = 128 * 1024;
const CSS_FILE_LIMIT: usize = 1024 * 1024;
pub(crate) const FONT_FILE_LIMIT: usize = 1024 * 1024;
const PACKAGE_LIMIT: usize = 4 * 1024 * 1024;
const CATALOG_URL: &str = "https://rencal.org/plugins.json";

#[derive(Clone, Debug, Serialize, Type)]
pub struct InstalledPlugin {
    pub id: String,
    pub name: String,
    pub repo: Option<String>,
    pub local_dir: Option<String>,
    pub version: Option<String>,
    pub update_version: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Type)]
pub struct InstalledPlugins {
    pub plugins: Vec<InstalledPlugin>,
    pub errors: Vec<String>,
}

/// The catalog is a JSON array. Extra indexer metadata is ignored by the app.
#[derive(Clone, Debug, Deserialize, Serialize, Type)]
pub struct PluginCatalogEntry {
    pub id: String,
    pub name: String,
    pub repo: String,
    pub description: String,
    pub version: String,
    #[serde(default, deserialize_with = "deserialize_preview_url")]
    pub preview_url: Option<String>,
}

/// Preview metadata is optional: bad values must never hide an installable plugin.
fn deserialize_preview_url<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(value
        .as_str()
        .filter(|url| {
            url.strip_prefix("https://rencal.org/plugin-previews/")
                .and_then(|filename| filename.strip_suffix(".png"))
                .is_some_and(|hash| {
                    hash.len() == 64
                        && hash
                            .bytes()
                            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
                })
        })
        .map(str::to_owned))
}

#[derive(Clone, Debug, Serialize, Type)]
pub struct PluginCatalog {
    pub plugins: Vec<PluginCatalogEntry>,
    pub error: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PluginInstallErrorKind {
    InvalidInput,
    Network,
    RateLimited,
    MissingRelease,
    Incompatible,
    InvalidPackage,
    Configuration,
    Io,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PluginInstallError {
    pub kind: PluginInstallErrorKind,
    message: String,
}

impl PluginInstallError {
    fn new(kind: PluginInstallErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    fn invalid_package(message: impl Into<String>) -> Self {
        Self::new(PluginInstallErrorKind::InvalidPackage, message)
    }

    fn io(context: impl std::fmt::Display, error: impl std::fmt::Display) -> Self {
        Self::new(PluginInstallErrorKind::Io, format!("{context}: {error}"))
    }
}

impl std::fmt::Display for PluginInstallError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for PluginInstallError {}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, Type)]
pub struct PluginThemeInspection {
    pub id: String,
    pub name: String,
    pub appearance: Appearance,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, Type)]
pub struct PluginFontInspection {
    pub family: String,
    pub file: String,
    pub weight: u16,
    pub style: FontStyle,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, Type)]
pub struct PluginInspection {
    pub id: String,
    pub name: String,
    pub description: String,
    pub repo: String,
    pub version: String,
    pub min_rencal_version: String,
    pub compatible: bool,
    pub themes: Vec<PluginThemeInspection>,
    pub fonts: Vec<PluginFontInspection>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PluginReconcileError {
    pub package: String,
    pub message: String,
}

#[derive(Clone)]
pub struct PluginManager {
    inner: Arc<PluginManagerInner>,
}

struct PluginManagerInner {
    downloader: Arc<dyn Downloader>,
    api_base: Url,
    raw_base: Url,
    declarations_path: PathBuf,
    lock_path: PathBuf,
    packages_dir: PathBuf,
    mutations: Mutex<()>,
    catalog: Mutex<Vec<PluginCatalogEntry>>,
}

struct DownloadResponse {
    status: StatusCode,
    rate_limited: bool,
    retry_after: Option<String>,
    bytes: Vec<u8>,
}

trait Downloader: Send + Sync {
    fn get(
        &self,
        url: Url,
        limit: usize,
    ) -> Pin<Box<dyn Future<Output = Result<DownloadResponse, PluginInstallError>> + Send + '_>>;
}

struct ReqwestDownloader {
    client: reqwest::Client,
}

#[derive(Clone, Debug)]
struct Repository {
    owner: String,
    name: String,
    display: String,
}

struct ResolvedPackage {
    inspection: PluginInspection,
    manifest: PluginManifest,
    manifest_text: Vec<u8>,
    commit: String,
}

#[derive(Clone, Copy)]
enum DeclarationPolicy {
    Ensure,
    RequireExisting,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
}

#[derive(Deserialize)]
struct GithubCommit {
    sha: String,
}

enum MissingResponse {
    Release,
    Commit,
    PackageFile(String),
}

impl PluginManager {
    pub fn system() -> Result<Self, PluginInstallError> {
        let declarations_path = plugins_file_path().map_err(|error| {
            PluginInstallError::new(PluginInstallErrorKind::Configuration, error.to_string())
        })?;
        let packages_dir = plugins_dir().map_err(|error| {
            PluginInstallError::new(PluginInstallErrorKind::Configuration, error.to_string())
        })?;
        let lock_path = plugins_lock_path().map_err(|error| {
            PluginInstallError::new(PluginInstallErrorKind::Configuration, error.to_string())
        })?;
        Self::new(
            declarations_path,
            lock_path,
            packages_dir,
            Url::parse("https://api.github.com/").expect("valid GitHub API URL"),
            Url::parse("https://raw.githubusercontent.com/").expect("valid GitHub raw URL"),
        )
    }

    fn new(
        declarations_path: PathBuf,
        lock_path: PathBuf,
        packages_dir: PathBuf,
        api_base: Url,
        raw_base: Url,
    ) -> Result<Self, PluginInstallError> {
        // reqwest intentionally leaves provider choice to the application.
        // Installing ring is idempotent; another Tauri plugin may have done it.
        let _ = rustls::crypto::ring::default_provider().install_default();
        let client = reqwest::Client::builder()
            .user_agent(format!("renCal/{}", env!("CARGO_PKG_VERSION")))
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|error| {
                PluginInstallError::new(
                    PluginInstallErrorKind::Network,
                    format!("could not create GitHub client: {error}"),
                )
            })?;
        Ok(Self::with_downloader(
            declarations_path,
            lock_path,
            packages_dir,
            api_base,
            raw_base,
            Arc::new(ReqwestDownloader { client }),
        ))
    }

    fn with_downloader(
        declarations_path: PathBuf,
        lock_path: PathBuf,
        packages_dir: PathBuf,
        api_base: Url,
        raw_base: Url,
        downloader: Arc<dyn Downloader>,
    ) -> Self {
        Self {
            inner: Arc::new(PluginManagerInner {
                downloader,
                api_base,
                raw_base,
                declarations_path,
                lock_path,
                packages_dir,
                mutations: Mutex::new(()),
                catalog: Mutex::new(Vec::new()),
            }),
        }
    }

    /// Include missing/broken declarations and manually placed packages, offline.
    pub async fn list(&self) -> InstalledPlugins {
        let _guard = self.inner.mutations.lock().await;
        let mut errors = Vec::new();
        let (declarations, locks) = self.load_state().unwrap_or_else(|error| {
            errors.push(error.to_string());
            (PluginsFile::default(), PluginLockFile::default())
        });
        let scan = scan_packages(&self.inner.packages_dir, running_app_version().as_ref());
        let parsed = declarations.declarations().unwrap_or_default();
        for repo in parsed.iter().filter_map(|declaration| match declaration {
            PluginDeclaration::Repository(repo) => Some(repo),
            PluginDeclaration::Local(_) => None,
        }) {
            if !locks
                .plugins
                .iter()
                .any(|entry| entry.repo.eq_ignore_ascii_case(repo))
            {
                errors.push(format!(
                    "Plugin repository {repo:?} has not been resolved. Re-save plugins.toml while online to install it."
                ));
            }
        }
        let mut plugins: Vec<_> = locks
            .plugins
            .iter()
            .filter(|entry| {
                declarations
                    .plugins
                    .iter()
                    .any(|repo| repo.eq_ignore_ascii_case(&entry.repo))
            })
            .cloned()
            .map(|entry| InstalledPlugin {
                name: entry.id.clone(),
                id: entry.id,
                repo: Some(entry.repo),
                local_dir: None,
                version: Some(entry.version),
                update_version: None,
                error: Some(
                    "Package files are missing. Install the repository again to restore it.".into(),
                ),
            })
            .collect();
        for package in scan.packages {
            if let Some(row) = plugins.iter_mut().find(|row| row.id == package.id) {
                row.name = package.name;
                row.version = Some(package.version);
                row.error = None;
            } else {
                plugins.push(InstalledPlugin {
                    id: package.id,
                    name: package.name,
                    repo: None,
                    local_dir: None,
                    version: Some(package.version),
                    update_version: None,
                    error: None,
                });
            }
        }
        for error in scan.errors {
            if let Some(row) = plugins.iter_mut().find(|row| row.id == error.package) {
                row.error = Some(error.message);
            } else if validate_package_id(&error.package).is_ok() {
                plugins.push(InstalledPlugin {
                    name: error.package.clone(),
                    id: error.package,
                    repo: None,
                    local_dir: None,
                    version: None,
                    update_version: None,
                    error: Some(error.message),
                });
            } else {
                errors.push(format!("{}: {}", error.package, error.message));
            }
        }
        for entry in &locks.local {
            if let Some(row) = plugins.iter_mut().find(|row| row.id == entry.id) {
                row.local_dir = Some(entry.dir.clone());
                if row
                    .error
                    .as_deref()
                    .is_some_and(|error| error.starts_with("Package files are missing."))
                {
                    row.error = None;
                }
            } else {
                plugins.push(InstalledPlugin {
                    id: entry.id.clone(),
                    name: entry.id.clone(),
                    repo: None,
                    local_dir: Some(entry.dir.clone()),
                    version: None,
                    update_version: None,
                    error: None,
                });
            }
        }
        self.append_local_declaration_errors(&parsed, &locks, &mut errors);

        let catalog = self.inner.catalog.lock().await;
        for row in &mut plugins {
            if row.local_dir.is_some() {
                continue;
            }
            row.update_version = catalog
                .iter()
                .find(|entry| {
                    row.id == entry.id
                        && row
                            .repo
                            .as_ref()
                            .is_some_and(|repo| repo.eq_ignore_ascii_case(&entry.repo))
                        && row.version.as_ref().is_some_and(|version| {
                            match (Version::parse(&entry.version), Version::parse(version)) {
                                (Ok(latest), Ok(current)) => {
                                    latest.cmp_precedence(&current).is_gt()
                                }
                                _ => false,
                            }
                        })
                })
                .map(|entry| entry.version.clone());
        }
        plugins.sort_by_key(|row| row.name.to_lowercase());
        InstalledPlugins { plugins, errors }
    }

    fn append_local_declaration_errors(
        &self,
        declarations: &[PluginDeclaration],
        locks: &PluginLockFile,
        errors: &mut Vec<String>,
    ) {
        for dir in declarations
            .iter()
            .filter_map(|declaration| match declaration {
                PluginDeclaration::Local(path) => Some(path),
                PluginDeclaration::Repository(_) => None,
            })
        {
            let manifest = match read_local_manifest(dir) {
                Ok(manifest) => manifest,
                Err(error) => {
                    errors.push(format!("Local plugin {}: {error}", dir.display()));
                    continue;
                }
            };
            let target = self.inner.packages_dir.join(&manifest.id);
            if let Ok(metadata) = std::fs::symlink_metadata(&target)
                && !metadata.file_type().is_symlink()
                && !locks.plugins.iter().any(|entry| entry.id == manifest.id)
            {
                errors.push(format!(
                    "{} is an unmanaged plugin directory; remove it by hand before using the local checkout at {}",
                    target.display(),
                    dir.display()
                ));
            }
        }
    }

    /// Fetch through the backend so the webview's remote-resource CSP stays closed.
    /// Keep the last successful catalog for this process if refresh fails.
    pub async fn catalog(&self) -> PluginCatalog {
        let result = self.fetch_catalog().await;
        let mut cached = self.inner.catalog.lock().await;
        let error = match result {
            Ok(entries) => {
                *cached = entries;
                None
            }
            Err(error) => Some(error.to_string()),
        };
        let plugins = cached.clone();
        PluginCatalog { plugins, error }
    }

    async fn fetch_catalog(&self) -> Result<Vec<PluginCatalogEntry>, PluginInstallError> {
        let response = self
            .inner
            .downloader
            .get(Url::parse(CATALOG_URL).expect("catalog URL"), PACKAGE_LIMIT)
            .await?;
        if !response.status.is_success() {
            return Err(PluginInstallError::new(
                PluginInstallErrorKind::Network,
                format!("Plugin catalog is unavailable (HTTP {}).", response.status),
            ));
        }
        let mut entries: Vec<PluginCatalogEntry> = serde_json::from_slice(&response.bytes)
            .map_err(|error| {
                PluginInstallError::invalid_package(format!("Invalid plugin catalog: {error}"))
            })?;
        let mut ids = std::collections::HashSet::new();
        for entry in &entries {
            validate_package_id(&entry.id)
                .map_err(|error| PluginInstallError::invalid_package(error.to_string()))?;
            let repo = Repository::parse(&entry.repo)?;
            super::validate_manifest_owner_for_id(&entry.id, &repo.owner)
                .map_err(|error| PluginInstallError::invalid_package(error.to_string()))?;
            Version::parse(&entry.version)
                .map_err(|error| PluginInstallError::invalid_package(error.to_string()))?;
            if entry.name.trim().is_empty() || !ids.insert(&entry.id) {
                return Err(PluginInstallError::invalid_package(
                    "Invalid or duplicate catalog entry",
                ));
            }
        }
        entries.sort_by_key(|entry| entry.name.to_lowercase());
        Ok(entries)
    }

    /// Resolve and validate the latest stable release or default-branch commit.
    pub async fn inspect(&self, repo: &str) -> Result<PluginInspection, PluginInstallError> {
        let repository = Repository::parse(repo)?;
        Ok(self.resolve_latest(&repository).await?.inspection)
    }

    /// Install the latest package, or replace the installed package with it.
    pub async fn install(&self, repo: &str) -> Result<PluginInspection, PluginInstallError> {
        let repository = Repository::parse(repo)?;
        let _guard = self.inner.mutations.lock().await;
        let (declarations, locks) = self.load_state()?;
        let package = self.resolve_latest(&repository).await?;
        self.require_compatible(&package.inspection)?;
        self.install_resolved(
            &repository,
            package,
            declarations,
            locks,
            None,
            DeclarationPolicy::Ensure,
        )
        .await
    }

    /// Remove both the declaration and package directory. A missing directory
    /// is tolerated so a broken declaration can still be cleaned up.
    pub async fn uninstall(&self, id: &str) -> Result<(), PluginInstallError> {
        validate_package_id(id).map_err(|error| {
            PluginInstallError::new(PluginInstallErrorKind::InvalidInput, error.to_string())
        })?;
        let _guard = self.inner.mutations.lock().await;
        let (mut declarations, mut locks) = self.load_state()?;
        let previous_locks = locks.clone();
        let index = locks.plugins.iter().position(|entry| entry.id == id);
        let local_index = locks.local.iter().position(|entry| entry.id == id);
        let target = self.inner.packages_dir.join(id);
        if index.is_none() && local_index.is_none() && std::fs::symlink_metadata(&target).is_err() {
            return Err(PluginInstallError::new(
                PluginInstallErrorKind::InvalidInput,
                format!("plugin {id:?} is not installed"),
            ));
        }
        std::fs::create_dir_all(&self.inner.packages_dir).map_err(|error| {
            PluginInstallError::io(
                format!("could not create {}", self.inner.packages_dir.display()),
                error,
            )
        })?;
        let backup = tempfile::Builder::new()
            .prefix(".rencal-uninstall-")
            .tempdir_in(&self.inner.packages_dir)
            .map_err(|error| PluginInstallError::io("could not create uninstall backup", error))?;
        let backup_package = backup.path().join("package");
        let moved = if std::fs::symlink_metadata(&target).is_ok() {
            std::fs::rename(&target, &backup_package).map_err(|error| {
                PluginInstallError::io(format!("could not remove plugin {id:?}"), error)
            })?;
            true
        } else {
            false
        };

        if let Some(index) = index {
            let entry = locks.plugins.remove(index);
            declarations
                .plugins
                .retain(|repo| !repo.eq_ignore_ascii_case(&entry.repo));
        }
        if let Some(index) = local_index {
            let entry = locks.local.remove(index);
            declarations.plugins.retain(|value| {
                PluginDeclaration::parse(value)
                    .ok()
                    .is_none_or(|declaration| match declaration {
                        PluginDeclaration::Local(path) => path != Path::new(&entry.dir),
                        PluginDeclaration::Repository(_) => true,
                    })
            });
        }
        if let Err(error) = save_plugin_lock_file(&self.inner.lock_path, &locks) {
            if moved {
                let _ = std::fs::rename(&backup_package, &target);
            }
            return Err(PluginInstallError::new(
                PluginInstallErrorKind::Configuration,
                error.to_string(),
            ));
        }
        if let Err(error) = save_plugins_file(&self.inner.declarations_path, &declarations) {
            let _ = save_plugin_lock_file(&self.inner.lock_path, &previous_locks);
            if moved {
                let _ = std::fs::rename(&backup_package, &target);
            }
            return Err(PluginInstallError::new(
                PluginInstallErrorKind::Configuration,
                error.to_string(),
            ));
        }
        Ok(())
    }

    /// Make managed packages match the declarations file. Undeclared packages
    /// are removed only when a lock entry proves renCal installed them; loose
    /// directories and symlinked development checkouts remain untouched.
    pub async fn reconcile(&self) -> Vec<PluginReconcileError> {
        let (missing, mut errors) = {
            let _guard = self.inner.mutations.lock().await;
            let (declarations, mut locks) = match self.load_state() {
                Ok(state) => state,
                Err(error) => {
                    return vec![PluginReconcileError {
                        package: self.inner.declarations_path.display().to_string(),
                        message: error.to_string(),
                    }];
                }
            };
            if let Err(error) = self.prune_undeclared(&declarations, &mut locks) {
                return vec![PluginReconcileError {
                    package: self.inner.declarations_path.display().to_string(),
                    message: error.to_string(),
                }];
            }
            let local_errors = self.apply_local(&declarations, &mut locks);
            let repositories = declarations
                .declarations()
                .expect("loaded declarations are valid")
                .into_iter()
                .filter_map(|declaration| match declaration {
                    PluginDeclaration::Repository(repo) => Some(repo),
                    PluginDeclaration::Local(_) => None,
                })
                .filter(|repo| {
                    locks
                        .plugins
                        .iter()
                        .find(|entry| entry.repo.eq_ignore_ascii_case(repo))
                        .is_none_or(|entry| !self.inner.packages_dir.join(&entry.id).is_dir())
                })
                .collect::<Vec<_>>();
            (repositories, local_errors)
        };

        for repo in missing {
            if let Err(error) = self.restore_entry(&repo).await {
                errors.push(PluginReconcileError {
                    package: repo,
                    message: error.to_string(),
                });
            }
        }
        errors
    }

    fn prune_undeclared(
        &self,
        declarations: &PluginsFile,
        locks: &mut PluginLockFile,
    ) -> Result<(), PluginInstallError> {
        let parsed = declarations.declarations().map_err(|error| {
            PluginInstallError::new(PluginInstallErrorKind::Configuration, error.to_string())
        })?;
        let repositories: Vec<_> = parsed
            .iter()
            .filter_map(|declaration| match declaration {
                PluginDeclaration::Repository(repo) => Some(repo.as_str()),
                PluginDeclaration::Local(_) => None,
            })
            .collect();
        let local_dirs: HashSet<_> = parsed
            .iter()
            .filter_map(|declaration| match declaration {
                PluginDeclaration::Local(path) => Some(path.clone()),
                PluginDeclaration::Repository(_) => None,
            })
            .collect();
        let removed_plugins: Vec<_> = locks
            .plugins
            .iter()
            .filter(|entry| {
                !repositories
                    .iter()
                    .any(|repo| repo.eq_ignore_ascii_case(&entry.repo))
            })
            .cloned()
            .collect();
        let removed_local: Vec<_> = locks
            .local
            .iter()
            .filter(|entry| !local_dirs.contains(Path::new(&entry.dir)))
            .cloned()
            .collect();
        if removed_plugins.is_empty() && removed_local.is_empty() {
            return Ok(());
        }

        std::fs::create_dir_all(&self.inner.packages_dir).map_err(|error| {
            PluginInstallError::io(
                format!("could not create {}", self.inner.packages_dir.display()),
                error,
            )
        })?;
        let backup = tempfile::Builder::new()
            .prefix(".rencal-prune-")
            .tempdir_in(&self.inner.packages_dir)
            .map_err(|error| PluginInstallError::io("could not create prune backup", error))?;
        let mut moved = Vec::new();
        let mut ids = HashSet::new();
        for entry in &removed_plugins {
            let has_retained_local = locks
                .local
                .iter()
                .any(|local| local.id == entry.id && local_dirs.contains(Path::new(&local.dir)));
            if !has_retained_local {
                ids.insert(entry.id.clone());
            }
        }
        ids.extend(removed_local.iter().map(|entry| entry.id.clone()));
        for id in ids {
            let target = self.inner.packages_dir.join(&id);
            match std::fs::symlink_metadata(&target) {
                Ok(metadata)
                    if removed_local.iter().any(|entry| entry.id == id)
                        && !removed_plugins.iter().any(|entry| entry.id == id)
                        && !metadata.file_type().is_symlink() => {}
                Ok(_) => {
                    let backup_package = backup.path().join(&id);
                    if let Err(error) = std::fs::rename(&target, &backup_package) {
                        restore_pruned_packages(&moved);
                        return Err(PluginInstallError::io(
                            format!("could not prune plugin {id:?}"),
                            error,
                        ));
                    }
                    moved.push((backup_package, target));
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    restore_pruned_packages(&moved);
                    return Err(PluginInstallError::io(
                        format!("could not inspect plugin {id:?}"),
                        error,
                    ));
                }
            }
        }

        let previous_locks = locks.clone();
        locks.plugins.retain(|entry| {
            repositories
                .iter()
                .any(|repo| repo.eq_ignore_ascii_case(&entry.repo))
        });
        locks
            .local
            .retain(|entry| local_dirs.contains(Path::new(&entry.dir)));
        if let Err(error) = save_plugin_lock_file(&self.inner.lock_path, locks) {
            *locks = previous_locks;
            restore_pruned_packages(&moved);
            return Err(PluginInstallError::new(
                PluginInstallErrorKind::Configuration,
                error.to_string(),
            ));
        }
        Ok(())
    }

    fn apply_local(
        &self,
        declarations: &PluginsFile,
        locks: &mut PluginLockFile,
    ) -> Vec<PluginReconcileError> {
        let local: Vec<_> = declarations
            .declarations()
            .expect("loaded declarations are valid")
            .into_iter()
            .filter_map(|declaration| match declaration {
                PluginDeclaration::Local(path) => Some(path),
                PluginDeclaration::Repository(_) => None,
            })
            .collect();
        if local.is_empty() {
            return Vec::new();
        }

        #[cfg(not(unix))]
        return local
            .into_iter()
            .map(|path| PluginReconcileError {
                package: path.display().to_string(),
                message: "local plugins are not supported on this platform yet".into(),
            })
            .collect();

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;

            let mut errors = Vec::new();
            if let Err(error) = std::fs::create_dir_all(&self.inner.packages_dir) {
                return vec![PluginReconcileError {
                    package: self.inner.packages_dir.display().to_string(),
                    message: format!("could not create plugin directory: {error}"),
                }];
            }
            let backup = match tempfile::Builder::new()
                .prefix(".rencal-shadow-")
                .tempdir_in(&self.inner.packages_dir)
            {
                Ok(backup) => backup,
                Err(error) => {
                    return vec![PluginReconcileError {
                        package: self.inner.packages_dir.display().to_string(),
                        message: format!("could not create local plugin backup: {error}"),
                    }];
                }
            };
            let previous_locks = locks.clone();
            let mut moved = Vec::new();
            let mut created = Vec::new();
            let mut claimed = HashSet::new();

            for dir in local {
                let label = dir.display().to_string();
                let manifest = match read_local_manifest(&dir) {
                    Ok(manifest) => manifest,
                    Err(error) => {
                        errors.push(PluginReconcileError {
                            package: label,
                            message: error.to_string(),
                        });
                        continue;
                    }
                };
                let id = manifest.id;
                if !claimed.insert(id.clone()) {
                    errors.push(PluginReconcileError {
                        package: label,
                        message: format!(
                            "plugin id {id:?} is already provided by another local checkout"
                        ),
                    });
                    continue;
                }
                let target = self.inner.packages_dir.join(&id);
                let mut moved_this = None;
                let mut needs_link = true;
                match std::fs::symlink_metadata(&target) {
                    Ok(metadata) if metadata.file_type().is_symlink() => {
                        if symlink_points_to(&target, &dir) {
                            needs_link = false;
                        } else {
                            let backup_path = backup.path().join(format!("{}-{}", moved.len(), id));
                            if let Err(error) = std::fs::rename(&target, &backup_path) {
                                errors.push(PluginReconcileError {
                                    package: label,
                                    message: format!(
                                        "could not replace local plugin link: {error}"
                                    ),
                                });
                                continue;
                            }
                            moved_this = Some((backup_path, target.clone()));
                        }
                    }
                    Ok(_) => {
                        if locks.plugins.iter().any(|entry| entry.id == id) {
                            let backup_path = backup.path().join(format!("{}-{}", moved.len(), id));
                            if let Err(error) = std::fs::rename(&target, &backup_path) {
                                errors.push(PluginReconcileError {
                                    package: label,
                                    message: format!(
                                        "could not shadow managed plugin {id:?}: {error}"
                                    ),
                                });
                                continue;
                            }
                            moved_this = Some((backup_path, target.clone()));
                        } else {
                            errors.push(PluginReconcileError {
                                package: label,
                                message: format!("{} is an unmanaged plugin directory; remove it by hand before using this local checkout", target.display()),
                            });
                            continue;
                        }
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => {
                        errors.push(PluginReconcileError {
                            package: label,
                            message: format!(
                                "could not inspect plugin slot {}: {error}",
                                target.display()
                            ),
                        });
                        continue;
                    }
                }

                if needs_link {
                    if let Err(error) = symlink(&dir, &target) {
                        if let Some((backup_path, original)) = &moved_this {
                            let _ = std::fs::rename(backup_path, original);
                        }
                        errors.push(PluginReconcileError {
                            package: label,
                            message: format!("could not link local plugin {id:?}: {error}"),
                        });
                        continue;
                    }
                    created.push(target);
                    if let Some(moved_entry) = moved_this {
                        moved.push(moved_entry);
                    }
                }

                locks.local.retain(|entry| entry.id != id);
                locks.local.push(LocalLockEntry { id, dir: label });
            }

            if *locks != previous_locks
                && let Err(error) = save_plugin_lock_file(&self.inner.lock_path, locks)
            {
                for target in created.iter().rev() {
                    let _ = remove_path(target);
                }
                restore_pruned_packages(&moved);
                *locks = previous_locks;
                errors.push(PluginReconcileError {
                    package: self.inner.lock_path.display().to_string(),
                    message: error.to_string(),
                });
            }
            errors
        }
    }

    pub(crate) fn declarations_path(&self) -> &Path {
        &self.inner.declarations_path
    }

    /// Restore one declared repository. Locked commits are fetched exactly;
    /// new declarations resolve the latest release.
    async fn restore_entry(&self, repo: &str) -> Result<(), PluginInstallError> {
        let repository = Repository::parse(repo)?;
        let _guard = self.inner.mutations.lock().await;
        let (declarations, locks) = match self.load_state() {
            Ok(state) => state,
            Err(error) => return Err(error),
        };
        if !declarations
            .plugins
            .iter()
            .any(|declared| declared.eq_ignore_ascii_case(repo))
        {
            return Ok(());
        }
        let locked = locks
            .plugins
            .iter()
            .find(|entry| entry.repo.eq_ignore_ascii_case(repo))
            .cloned();
        let package = match &locked {
            Some(entry) => {
                self.resolve_commit_ref(&repository, entry.commit.clone(), None)
                    .await?
            }
            None => self.resolve_latest(&repository).await?,
        };
        if locked
            .as_ref()
            .is_some_and(|entry| package.manifest.id != entry.id)
        {
            return Err(PluginInstallError::invalid_package(format!(
                "manifest id {:?} does not match declared plugin id {:?}",
                package.manifest.id,
                locked
                    .as_ref()
                    .map(|entry| entry.id.as_str())
                    .unwrap_or_default()
            )));
        }
        self.require_compatible(&package.inspection)?;
        self.install_resolved(
            &repository,
            package,
            declarations,
            locks,
            locked.as_ref().map(|entry| entry.id.as_str()),
            DeclarationPolicy::RequireExisting,
        )
        .await?;
        Ok(())
    }

    fn load_declarations(&self) -> Result<PluginsFile, PluginInstallError> {
        load_plugins_file(&self.inner.declarations_path).map_err(|error| {
            PluginInstallError::new(PluginInstallErrorKind::Configuration, error.to_string())
        })
    }

    fn load_state(&self) -> Result<(PluginsFile, PluginLockFile), PluginInstallError> {
        let declarations = self.load_declarations()?;
        let locks = load_plugin_lock_file(&self.inner.lock_path).map_err(|error| {
            PluginInstallError::new(PluginInstallErrorKind::Configuration, error.to_string())
        })?;
        Ok((declarations, locks))
    }

    async fn resolve_latest(
        &self,
        repository: &Repository,
    ) -> Result<ResolvedPackage, PluginInstallError> {
        let url = self.api_url(repository, &["releases", "latest"]);
        if let Some(bytes) = self.fetch_optional(url, RELEASE_RESPONSE_LIMIT).await? {
            let release: GithubRelease = serde_json::from_slice(&bytes).map_err(|error| {
                PluginInstallError::new(
                    PluginInstallErrorKind::Network,
                    format!("GitHub returned an invalid release response: {error}"),
                )
            })?;
            let commit = self
                .resolve_commit(repository, Some(&release.tag_name))
                .await?;
            return self
                .resolve_commit_ref(repository, commit, Some(&release.tag_name))
                .await;
        }

        let commit = self.resolve_commit(repository, None).await?;
        self.resolve_commit_ref(repository, commit, None).await
    }

    async fn resolve_commit(
        &self,
        repository: &Repository,
        reference: Option<&str>,
    ) -> Result<String, PluginInstallError> {
        let mut url = self.api_url(repository, &["commits"]);
        if let Some(reference) = reference {
            url.query_pairs_mut().append_pair("sha", reference);
        }
        url.query_pairs_mut().append_pair("per_page", "1");
        let bytes = self
            .fetch_bounded(url, RELEASE_RESPONSE_LIMIT, MissingResponse::Commit)
            .await?;
        let commits: Vec<GithubCommit> = serde_json::from_slice(&bytes).map_err(|error| {
            PluginInstallError::new(
                PluginInstallErrorKind::Network,
                format!("GitHub returned an invalid commit response: {error}"),
            )
        })?;
        let commit = commits.into_iter().next().ok_or_else(|| {
            PluginInstallError::new(
                PluginInstallErrorKind::MissingRelease,
                "repository reference was not found",
            )
        })?;
        validate_commit_sha(&commit.sha).map_err(PluginInstallError::invalid_package)?;
        Ok(commit.sha)
    }

    async fn resolve_commit_ref(
        &self,
        repository: &Repository,
        commit: String,
        release_tag: Option<&str>,
    ) -> Result<ResolvedPackage, PluginInstallError> {
        validate_commit_sha(&commit).map_err(PluginInstallError::invalid_package)?;
        let manifest_url = self.raw_url(repository, &commit, MANIFEST_FILE);
        let manifest_text = self
            .fetch_bounded(
                manifest_url,
                MANIFEST_LIMIT,
                MissingResponse::PackageFile(MANIFEST_FILE.into()),
            )
            .await?;
        let contents = std::str::from_utf8(&manifest_text).map_err(|error| {
            PluginInstallError::invalid_package(format!(
                "{MANIFEST_FILE} is not valid UTF-8: {error}"
            ))
        })?;
        // Inspection must be able to describe an incompatible package, so the
        // compatibility gate is calculated separately and enforced by install.
        let manifest = validate_manifest(contents, None)
            .map_err(|error| PluginInstallError::invalid_package(error.to_string()))?;
        validate_manifest_owner(&manifest, &repository.owner)
            .map_err(|error| PluginInstallError::invalid_package(error.to_string()))?;
        if let Some(tag) = release_tag {
            validate_release_tag(&manifest, tag)
                .map_err(|error| PluginInstallError::invalid_package(error.to_string()))?;
        }

        let minimum = Version::parse(&manifest.min_rencal_version)
            .expect("validated manifest minimum version");
        let compatible = running_app_version().is_none_or(|current| current >= minimum);
        let inspection = PluginInspection {
            id: manifest.id.clone(),
            name: manifest.name.clone(),
            description: manifest.description.clone(),
            repo: repository.display.clone(),
            version: manifest.version.clone(),
            min_rencal_version: manifest.min_rencal_version.clone(),
            compatible,
            themes: manifest
                .contributes
                .themes
                .iter()
                .map(|theme| PluginThemeInspection {
                    id: theme.id.clone(),
                    name: theme.name.clone(),
                    appearance: theme.appearance,
                })
                .collect(),
            fonts: manifest
                .contributes
                .fonts
                .iter()
                .map(|font| PluginFontInspection {
                    family: font.family.clone(),
                    file: font.file.clone(),
                    weight: font.weight,
                    style: font.style,
                })
                .collect(),
        };
        Ok(ResolvedPackage {
            inspection,
            manifest,
            manifest_text,
            commit,
        })
    }

    fn require_compatible(&self, inspection: &PluginInspection) -> Result<(), PluginInstallError> {
        if inspection.compatible {
            return Ok(());
        }
        Err(PluginInstallError::new(
            PluginInstallErrorKind::Incompatible,
            format!(
                "{} requires renCal {} or newer",
                inspection.name, inspection.min_rencal_version
            ),
        ))
    }

    async fn install_resolved(
        &self,
        repository: &Repository,
        package: ResolvedPackage,
        mut declarations: PluginsFile,
        mut locks: PluginLockFile,
        expected_id: Option<&str>,
        declaration_policy: DeclarationPolicy,
    ) -> Result<PluginInspection, PluginInstallError> {
        if expected_id.is_some_and(|id| id != package.manifest.id) {
            return Err(PluginInstallError::invalid_package(
                "resolved package id changed while installing",
            ));
        }
        std::fs::create_dir_all(&self.inner.packages_dir).map_err(|error| {
            PluginInstallError::io(
                format!("could not create {}", self.inner.packages_dir.display()),
                error,
            )
        })?;
        let staging = tempfile::Builder::new()
            .prefix(".rencal-install-")
            .tempdir_in(&self.inner.packages_dir)
            .map_err(|error| PluginInstallError::io("could not create install staging", error))?;
        self.write_staged_package(staging.path(), repository, &package)
            .await?;

        // A hand edit can remove the declaration while the package downloads.
        // Reload immediately before committing so reconciliation never writes
        // that stale declaration back or installs an unwanted package.
        if matches!(declaration_policy, DeclarationPolicy::RequireExisting) {
            (declarations, locks) = self.load_state()?;
            if !declarations
                .plugins
                .iter()
                .any(|repo| repo.eq_ignore_ascii_case(&repository.display))
            {
                return Ok(package.inspection);
            }
            if let Some(existing) = locks.plugins.iter().find(|entry| {
                entry.id == package.manifest.id
                    && !entry.repo.eq_ignore_ascii_case(&repository.display)
            }) {
                return Err(PluginInstallError::invalid_package(format!(
                    "plugin id {:?} is already managed by repository {:?}",
                    package.manifest.id, existing.repo
                )));
            }
        }

        if let Some(local) = locks
            .local
            .iter()
            .find(|entry| entry.id == package.manifest.id)
        {
            if matches!(declaration_policy, DeclarationPolicy::Ensure) {
                return Err(PluginInstallError::new(
                    PluginInstallErrorKind::InvalidInput,
                    format!(
                        "plugin id {:?} is provided by the local checkout at {}; remove that line from plugins.toml to install from GitHub",
                        package.manifest.id, local.dir
                    ),
                ));
            }

            let entry = PluginLockEntry {
                id: package.manifest.id.clone(),
                repo: repository.display.clone(),
                version: package.manifest.version.clone(),
                commit: package.commit.clone(),
            };
            if let Some(existing) = locks
                .plugins
                .iter_mut()
                .find(|existing| existing.id == entry.id)
            {
                *existing = entry;
            } else {
                locks.plugins.push(entry);
            }
            save_plugin_lock_file(&self.inner.lock_path, &locks).map_err(|error| {
                PluginInstallError::new(PluginInstallErrorKind::Configuration, error.to_string())
            })?;
            return Ok(package.inspection);
        }

        let target = self.inner.packages_dir.join(&package.manifest.id);
        let backup = tempfile::Builder::new()
            .prefix(".rencal-update-")
            .tempdir_in(&self.inner.packages_dir)
            .map_err(|error| PluginInstallError::io("could not create update backup", error))?;
        let backup_package = backup.path().join("package");
        let had_previous = if target.exists() {
            std::fs::rename(&target, &backup_package).map_err(|error| {
                PluginInstallError::io(
                    format!("could not stage old plugin {:?}", package.manifest.id),
                    error,
                )
            })?;
            true
        } else {
            false
        };

        if let Err(error) = std::fs::rename(staging.path(), &target) {
            if had_previous {
                let _ = std::fs::rename(&backup_package, &target);
            }
            return Err(PluginInstallError::io(
                format!("could not install plugin {:?}", package.manifest.id),
                error,
            ));
        }

        let previous_locks = locks.clone();
        let entry = PluginLockEntry {
            id: package.manifest.id.clone(),
            repo: repository.display.clone(),
            version: package.manifest.version.clone(),
            commit: package.commit.clone(),
        };
        let replaced_repo = locks
            .plugins
            .iter()
            .find(|existing| existing.id == entry.id)
            .map(|existing| existing.repo.clone());
        if let Some(existing) = locks
            .plugins
            .iter_mut()
            .find(|existing| existing.id == entry.id)
        {
            *existing = entry;
        } else {
            locks.plugins.push(entry);
        }
        if matches!(declaration_policy, DeclarationPolicy::Ensure) {
            if let Some(replaced_repo) = replaced_repo
                && !replaced_repo.eq_ignore_ascii_case(&repository.display)
            {
                declarations
                    .plugins
                    .retain(|repo| !repo.eq_ignore_ascii_case(&replaced_repo));
            }
            if !declarations
                .plugins
                .iter()
                .any(|repo| repo.eq_ignore_ascii_case(&repository.display))
            {
                declarations.plugins.push(repository.display.clone());
            }
        }
        if let Err(error) = save_plugin_lock_file(&self.inner.lock_path, &locks) {
            let _ = remove_path(&target);
            if had_previous {
                let _ = std::fs::rename(&backup_package, &target);
            }
            return Err(PluginInstallError::new(
                PluginInstallErrorKind::Configuration,
                error.to_string(),
            ));
        }
        if matches!(declaration_policy, DeclarationPolicy::Ensure)
            && let Err(error) = save_plugins_file(&self.inner.declarations_path, &declarations)
        {
            let _ = save_plugin_lock_file(&self.inner.lock_path, &previous_locks);
            let _ = remove_path(&target);
            if had_previous {
                let _ = std::fs::rename(&backup_package, &target);
            }
            return Err(PluginInstallError::new(
                PluginInstallErrorKind::Configuration,
                error.to_string(),
            ));
        }
        Ok(package.inspection)
    }

    async fn write_staged_package(
        &self,
        directory: &Path,
        repository: &Repository,
        package: &ResolvedPackage,
    ) -> Result<(), PluginInstallError> {
        std::fs::write(directory.join(MANIFEST_FILE), &package.manifest_text).map_err(|error| {
            PluginInstallError::io(format!("could not stage {MANIFEST_FILE}"), error)
        })?;
        let mut package_size = package.manifest_text.len();
        let mut files = Vec::new();
        let mut seen = HashSet::new();
        for theme in &package.manifest.contributes.themes {
            if seen.insert(theme.css.as_str()) {
                files.push((theme.css.as_str(), CSS_FILE_LIMIT, false));
            }
        }
        for font in &package.manifest.contributes.fonts {
            if seen.insert(font.file.as_str()) {
                files.push((font.file.as_str(), FONT_FILE_LIMIT, true));
            }
        }

        for (file, limit, is_font) in files {
            let bytes = self
                .fetch_bounded(
                    self.raw_url(repository, &package.commit, file),
                    limit,
                    MissingResponse::PackageFile(file.to_owned()),
                )
                .await?;
            if is_font && !bytes.starts_with(b"wOF2") {
                return Err(PluginInstallError::invalid_package(format!(
                    "font file {file:?} does not have a valid WOFF2 signature"
                )));
            }
            package_size += bytes.len();
            if package_size > PACKAGE_LIMIT {
                return Err(PluginInstallError::invalid_package(format!(
                    "plugin package exceeds the {} byte download limit",
                    PACKAGE_LIMIT
                )));
            }
            let path = directory.join(file);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|error| {
                    PluginInstallError::io(format!("could not create {}", parent.display()), error)
                })?;
            }
            std::fs::write(&path, bytes).map_err(|error| {
                PluginInstallError::io(format!("could not stage {}", path.display()), error)
            })?;
        }
        Ok(())
    }

    fn api_url(&self, repository: &Repository, suffix: &[&str]) -> Url {
        let mut url = self.inner.api_base.clone();
        url.path_segments_mut()
            .expect("GitHub API base can be a path base")
            .extend(["repos", &repository.owner, &repository.name])
            .extend(suffix.iter().copied());
        url
    }

    fn raw_url(&self, repository: &Repository, reference: &str, path: &str) -> Url {
        let mut url = self.inner.raw_base.clone();
        url.path_segments_mut()
            .expect("GitHub raw base can be a path base")
            .extend([&repository.owner, &repository.name, reference])
            .extend(path.split('/'));
        url
    }

    async fn fetch_optional(
        &self,
        url: Url,
        limit: usize,
    ) -> Result<Option<Vec<u8>>, PluginInstallError> {
        let response = self.inner.downloader.get(url, limit).await?;
        if response.status == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        self.read_response(response, limit, MissingResponse::Release)
            .await
            .map(Some)
    }

    async fn fetch_bounded(
        &self,
        url: Url,
        limit: usize,
        missing: MissingResponse,
    ) -> Result<Vec<u8>, PluginInstallError> {
        let response = self.inner.downloader.get(url, limit).await?;
        self.read_response(response, limit, missing).await
    }

    async fn read_response(
        &self,
        response: DownloadResponse,
        _limit: usize,
        missing: MissingResponse,
    ) -> Result<Vec<u8>, PluginInstallError> {
        let status = response.status;
        if response.rate_limited {
            let retry = response
                .retry_after
                .map(|seconds| format!("; retry after {seconds} seconds"))
                .unwrap_or_default();
            return Err(PluginInstallError::new(
                PluginInstallErrorKind::RateLimited,
                format!("GitHub rate limit exceeded{retry}"),
            ));
        }
        if status == StatusCode::NOT_FOUND {
            return Err(match missing {
                MissingResponse::Release => PluginInstallError::new(
                    PluginInstallErrorKind::MissingRelease,
                    "repository has no matching stable release",
                ),
                MissingResponse::Commit => PluginInstallError::new(
                    PluginInstallErrorKind::MissingRelease,
                    "repository reference was not found",
                ),
                MissingResponse::PackageFile(path) => PluginInstallError::invalid_package(format!(
                    "plugin reference does not contain {path:?}"
                )),
            });
        }
        if !status.is_success() {
            return Err(PluginInstallError::new(
                PluginInstallErrorKind::Network,
                format!("GitHub request failed with HTTP {status}"),
            ));
        }
        Ok(response.bytes)
    }
}

impl Downloader for ReqwestDownloader {
    fn get(
        &self,
        url: Url,
        limit: usize,
    ) -> Pin<Box<dyn Future<Output = Result<DownloadResponse, PluginInstallError>> + Send + '_>>
    {
        Box::pin(async move {
            let response = self.client.get(url).send().await.map_err(|error| {
                PluginInstallError::new(
                    PluginInstallErrorKind::Network,
                    format!("could not reach GitHub: {error}"),
                )
            })?;
            let status = response.status();
            let rate_limited = status == StatusCode::TOO_MANY_REQUESTS
                || (status == StatusCode::FORBIDDEN
                    && response
                        .headers()
                        .get("x-ratelimit-remaining")
                        .is_some_and(|remaining| remaining == "0"));
            let retry_after = response
                .headers()
                .get("retry-after")
                .and_then(|value| value.to_str().ok())
                .map(str::to_owned);
            if !status.is_success() {
                return Ok(DownloadResponse {
                    status,
                    rate_limited,
                    retry_after,
                    bytes: Vec::new(),
                });
            }
            if response
                .content_length()
                .is_some_and(|length| length > limit as u64)
            {
                return Err(PluginInstallError::invalid_package(format!(
                    "download exceeds the {limit} byte limit"
                )));
            }

            let mut bytes = Vec::new();
            let mut stream = response.bytes_stream();
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|error| {
                    PluginInstallError::new(
                        PluginInstallErrorKind::Network,
                        format!("GitHub download failed: {error}"),
                    )
                })?;
                if bytes.len() + chunk.len() > limit {
                    return Err(PluginInstallError::invalid_package(format!(
                        "download exceeds the {limit} byte limit"
                    )));
                }
                bytes.extend_from_slice(&chunk);
            }
            Ok(DownloadResponse {
                status,
                rate_limited,
                retry_after,
                bytes,
            })
        })
    }
}

impl Repository {
    fn parse(value: &str) -> Result<Self, PluginInstallError> {
        let coordinates = if value.contains("://") {
            let url = Url::parse(value).map_err(|_| Self::invalid(value))?;
            if url.scheme() != "https"
                || !url
                    .host_str()
                    .is_some_and(|host| host.eq_ignore_ascii_case("github.com"))
                || !url.username().is_empty()
                || url.password().is_some()
                || url.port().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
            {
                return Err(Self::invalid(value));
            }
            let path = url
                .path()
                .strip_prefix('/')
                .unwrap_or_default()
                .trim_end_matches('/');
            path.strip_suffix(".git").unwrap_or(path).to_string()
        } else {
            value.to_string()
        };

        let Some((owner, name)) = coordinates.split_once('/') else {
            return Err(Self::invalid(value));
        };
        let valid_owner = valid_segment(owner, false);
        let valid_name = valid_segment(name, true) && !name.contains('/');
        if !valid_owner || !valid_name {
            return Err(Self::invalid(value));
        }
        Ok(Self {
            owner: owner.to_string(),
            name: name.to_string(),
            display: format!("{owner}/{name}"),
        })
    }

    fn invalid(value: &str) -> PluginInstallError {
        PluginInstallError::new(
            PluginInstallErrorKind::InvalidInput,
            format!(
                "repository {value:?} must be owner/repo or an HTTPS github.com repository URL"
            ),
        )
    }
}

fn read_local_manifest(dir: &Path) -> Result<PluginManifest, PluginInstallError> {
    if !dir.is_dir() {
        return Err(PluginInstallError::new(
            PluginInstallErrorKind::Configuration,
            format!("local plugin directory {} does not exist", dir.display()),
        ));
    }
    let path = dir.join(MANIFEST_FILE);
    let contents = std::fs::read_to_string(&path).map_err(|error| {
        PluginInstallError::new(
            PluginInstallErrorKind::Configuration,
            format!("could not read {}: {error}", path.display()),
        )
    })?;
    validate_manifest(&contents, running_app_version().as_ref()).map_err(|error| {
        PluginInstallError::new(
            PluginInstallErrorKind::Configuration,
            format!("invalid local plugin manifest {}: {error}", path.display()),
        )
    })
}

#[cfg(unix)]
fn symlink_points_to(link: &Path, expected: &Path) -> bool {
    std::fs::canonicalize(link)
        .ok()
        .zip(std::fs::canonicalize(expected).ok())
        .is_some_and(|(actual, expected)| actual == expected)
}

pub(super) fn normalize_repository(value: &str) -> Result<String, PluginInstallError> {
    Repository::parse(value).map(|repository| repository.display)
}

fn valid_segment(value: &str, allow_dot: bool) -> bool {
    !value.is_empty()
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric()
                || byte == b'-'
                || byte == b'_'
                || (allow_dot && byte == b'.')
        })
}

fn validate_commit_sha(value: &str) -> Result<(), String> {
    if value.len() == 40
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        Ok(())
    } else {
        Err(format!(
            "commit {value:?} must be a lowercase 40-character SHA"
        ))
    }
}

fn remove_path(path: &Path) -> std::io::Result<()> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_dir() => std::fs::remove_dir_all(path),
        Ok(_) => std::fs::remove_file(path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn restore_pruned_packages(moved: &[(PathBuf, PathBuf)]) {
    for (backup, target) in moved.iter().rev() {
        let _ = std::fs::rename(backup, target);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Mutex as StdMutex;
    use tokio::sync::Notify;

    const COMMIT_V1: &str = "1111111111111111111111111111111111111111";
    const COMMIT_V2: &str = "2222222222222222222222222222222222222222";

    const MANIFEST_V1: &str = r#"id = "alice.dusk"
name = "Dusk"
version = "1.0.0"
description = "A quiet theme"
min_rencal_version = "0.8.0"

[[contributes.themes]]
id = "dark"
name = "Dusk Dark"
css = "themes/dark.css"
appearance = "dark"
"#;

    const MANIFEST_WITH_FONTS: &str = r#"id = "alice.dusk"
name = "Dusk"
version = "1.0.0"
description = "A quiet theme"
min_rencal_version = "0.8.0"

[[contributes.fonts]]
family = "Pixel"
file = "fonts/pixel.woff2"

[[contributes.fonts]]
family = "Pixel"
file = "fonts/pixel.woff2"
weight = 700

[[contributes.themes]]
id = "dark"
name = "Dusk Dark"
css = "themes/dark.css"
appearance = "dark"
"#;

    struct FixtureDownloader {
        base: Url,
        responses: Arc<StdMutex<HashMap<String, (u16, Vec<u8>)>>>,
        requests: Arc<StdMutex<HashMap<String, usize>>>,
        pause: Arc<StdMutex<Option<DownloadPause>>>,
    }

    #[derive(Clone)]
    struct DownloadPause {
        path: String,
        started: Arc<Notify>,
        resume: Arc<Notify>,
    }

    impl FixtureDownloader {
        fn new() -> Self {
            Self {
                base: Url::parse("https://fixture.invalid/").unwrap(),
                responses: Arc::new(StdMutex::new(HashMap::new())),
                requests: Arc::new(StdMutex::new(HashMap::new())),
                pause: Arc::new(StdMutex::new(None)),
            }
        }

        fn set(&self, path: &str, status: u16, body: impl Into<Vec<u8>>) {
            self.responses
                .lock()
                .unwrap()
                .insert(path.into(), (status, body.into()));
        }

        fn pause_on(&self, path: impl Into<String>) -> (Arc<Notify>, Arc<Notify>) {
            let pause = DownloadPause {
                path: path.into(),
                started: Arc::new(Notify::new()),
                resume: Arc::new(Notify::new()),
            };
            let handles = (pause.started.clone(), pause.resume.clone());
            *self.pause.lock().unwrap() = Some(pause);
            handles
        }

        fn request_count(&self, path: &str) -> usize {
            self.requests
                .lock()
                .unwrap()
                .get(path)
                .copied()
                .unwrap_or_default()
        }
    }

    impl Downloader for FixtureDownloader {
        fn get(
            &self,
            url: Url,
            limit: usize,
        ) -> Pin<Box<dyn Future<Output = Result<DownloadResponse, PluginInstallError>> + Send + '_>>
        {
            Box::pin(async move {
                let mut key = url.path().to_owned();
                if let Some(query) = url.query() {
                    key.push('?');
                    key.push_str(query);
                }
                *self
                    .requests
                    .lock()
                    .unwrap()
                    .entry(key.clone())
                    .or_default() += 1;
                let (status, bytes) = self
                    .responses
                    .lock()
                    .unwrap()
                    .get(&key)
                    .cloned()
                    .unwrap_or((404, Vec::new()));
                if bytes.len() > limit {
                    return Err(PluginInstallError::invalid_package(format!(
                        "download exceeds the {limit} byte limit"
                    )));
                }
                let pause = self.pause.lock().unwrap().clone();
                if let Some(pause) = pause.filter(|pause| pause.path == key) {
                    pause.started.notify_one();
                    pause.resume.notified().await;
                }
                Ok(DownloadResponse {
                    status: StatusCode::from_u16(status).unwrap(),
                    rate_limited: status == 429,
                    retry_after: None,
                    bytes,
                })
            })
        }
    }

    fn manager(temp: &tempfile::TempDir, downloader: Arc<FixtureDownloader>) -> PluginManager {
        PluginManager::with_downloader(
            temp.path().join("config/plugins.toml"),
            temp.path().join("data/plugins.lock"),
            temp.path().join("data/plugins"),
            downloader.base.clone(),
            downloader.base.clone(),
            downloader,
        )
    }

    fn serve_v1(downloader: &FixtureDownloader) {
        downloader.set(
            "/repos/Alice/rencal-dusk/releases/latest",
            200,
            br#"{"tag_name":"v1.0.0"}"#.to_vec(),
        );
        downloader.set(
            "/repos/Alice/rencal-dusk/commits?sha=v1.0.0&per_page=1",
            200,
            format!(r#"[{{"sha":"{COMMIT_V1}"}}]"#).into_bytes(),
        );
        downloader.set(
            &format!("/Alice/rencal-dusk/{COMMIT_V1}/rencal-plugin.toml"),
            200,
            MANIFEST_V1.as_bytes().to_vec(),
        );
        downloader.set(
            &format!("/Alice/rencal-dusk/{COMMIT_V1}/themes/dark.css"),
            200,
            b"--background: #111;".to_vec(),
        );
    }

    fn serve_fonts(downloader: &FixtureDownloader, commit: &str, manifest: &str, font: &[u8]) {
        downloader.set(
            &format!("/Alice/rencal-dusk/{commit}/rencal-plugin.toml"),
            200,
            manifest.as_bytes().to_vec(),
        );
        downloader.set(
            &format!("/Alice/rencal-dusk/{commit}/themes/dark.css"),
            200,
            b"--font-body: Pixel;".to_vec(),
        );
        downloader.set(
            &format!("/Alice/rencal-dusk/{commit}/fonts/pixel.woff2"),
            200,
            font.to_vec(),
        );
    }

    fn write_local_checkout(path: &Path) {
        write_local_checkout_as(path, "alice.dusk");
    }

    fn write_local_checkout_as(path: &Path, id: &str) {
        std::fs::create_dir_all(path.join("themes")).unwrap();
        std::fs::write(
            path.join(MANIFEST_FILE),
            MANIFEST_V1.replacen("alice.dusk", id, 1),
        )
        .unwrap();
        std::fs::write(path.join("themes/dark.css"), "--background: local;").unwrap();
    }

    #[tokio::test]
    async fn lists_installed_missing_and_broken_packages_offline() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader.clone());
        manager.install("Alice/rencal-dusk").await.unwrap();
        downloader.responses.lock().unwrap().clear();

        let snapshot = manager.list().await;
        assert!(snapshot.errors.is_empty());
        assert_eq!(snapshot.plugins[0].name, "Dusk");
        assert_eq!(
            snapshot.plugins[0].repo.as_deref(),
            Some("Alice/rencal-dusk")
        );
        assert!(snapshot.plugins[0].error.is_none());

        std::fs::remove_file(temp.path().join("data/plugins/alice.dusk/themes/dark.css")).unwrap();
        assert!(
            manager.list().await.plugins[0]
                .error
                .as_ref()
                .unwrap()
                .contains("dark.css")
        );
        std::fs::remove_dir_all(temp.path().join("data/plugins/alice.dusk")).unwrap();
        assert!(
            manager.list().await.plugins[0]
                .error
                .as_ref()
                .unwrap()
                .contains("missing")
        );
        manager.uninstall("alice.dusk").await.unwrap();
        assert!(manager.list().await.plugins.is_empty());
    }

    #[tokio::test]
    async fn lists_and_removes_manual_packages_without_hiding_config_errors() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        manager.install("Alice/rencal-dusk").await.unwrap();
        let config = temp.path().join("config/plugins.toml");
        std::fs::write(&config, "invalid toml").unwrap();
        let snapshot = manager.list().await;
        assert_eq!(snapshot.plugins[0].name, "Dusk");
        assert!(snapshot.plugins[0].repo.is_none());
        assert_eq!(snapshot.errors.len(), 1);
        assert!(manager.uninstall("alice.dusk").await.is_err());
        assert_eq!(std::fs::read_to_string(&config).unwrap(), "invalid toml");

        // Simulate the user repairing the config; the normal writer deliberately
        // refuses to overwrite malformed TOML.
        std::fs::write(&config, "plugins = []\n").unwrap();
        manager.uninstall("alice.dusk").await.unwrap();
        assert!(manager.list().await.plugins.is_empty());
        assert!(manager.uninstall("../plugins").await.is_err());
    }

    #[tokio::test]
    async fn catalog_uses_semantic_versions_and_preserves_last_good_entries() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader.clone());
        manager.install("Alice/rencal-dusk").await.unwrap();

        for (version, update) in [("1.0.0+build.2", false), ("0.9.0", false), ("1.10.0", true)] {
            downloader.set(
                "/plugins.json",
                200,
                serde_json::to_vec(&serde_json::json!([{
                    "id": "alice.dusk", "name": "Dusk", "repo": "Alice/rencal-dusk",
                    "description": "A quiet theme", "version": version,
                    "tag": format!("v{version}"), "stars": 42
                }]))
                .unwrap(),
            );
            assert!(manager.catalog().await.error.is_none());
            let installed = manager.list().await;
            assert_eq!(
                installed.plugins[0].update_version.as_deref(),
                update.then_some(version)
            );
        }

        downloader.set("/plugins.json", 503, Vec::new());
        let catalog = manager.catalog().await;
        assert!(catalog.error.unwrap().contains("503"));
        assert_eq!(catalog.plugins[0].version, "1.10.0");
        downloader.set("/plugins.json", 200, b"not json".to_vec());
        let catalog = manager.catalog().await;
        assert!(catalog.error.is_some());
        assert_eq!(catalog.plugins[0].version, "1.10.0");

        std::fs::write(
            temp.path()
                .join("data/plugins/alice.dusk/rencal-plugin.toml"),
            MANIFEST_V1.replace("1.0.0", "2.0.0"),
        )
        .unwrap();
        assert!(manager.list().await.plugins[0].update_version.is_none());

        manager.uninstall("alice.dusk").await.unwrap();
        assert!(manager.list().await.plugins.is_empty());
    }

    #[tokio::test]
    async fn rejects_catalog_entries_with_mismatched_owners() {
        let downloader = Arc::new(FixtureDownloader::new());
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader.clone());
        downloader.set(
            "/plugins.json",
            200,
            br#"[{
            "id":"alice.dusk", "name":"Dusk", "repo":"bob/dusk",
            "description":"Theme", "version":"1.0.0"
        }]"#
            .to_vec(),
        );
        let catalog = manager.catalog().await;
        assert!(catalog.error.unwrap().contains("does not match"));
        assert!(catalog.plugins.is_empty());
    }

    #[tokio::test]
    async fn inspects_installs_and_uninstalls_a_release() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);

        let inspection = manager.inspect("Alice/rencal-dusk").await.unwrap();
        assert_eq!(inspection.id, "alice.dusk");
        assert_eq!(inspection.themes[0].name, "Dusk Dark");
        assert!(inspection.compatible);

        manager.install("Alice/rencal-dusk").await.unwrap();
        assert_eq!(
            std::fs::read_to_string(temp.path().join("data/plugins/alice.dusk/themes/dark.css"))
                .unwrap(),
            "--background: #111;"
        );
        let declarations = load_plugins_file(&temp.path().join("config/plugins.toml")).unwrap();
        assert_eq!(declarations.plugins, ["Alice/rencal-dusk"]);
        let locks = load_plugin_lock_file(&temp.path().join("data/plugins.lock")).unwrap();
        assert_eq!(locks.plugins[0].version, "1.0.0");
        assert_eq!(locks.plugins[0].commit, COMMIT_V1);

        manager.uninstall("alice.dusk").await.unwrap();
        assert!(!temp.path().join("data/plugins/alice.dusk").exists());
        assert!(
            load_plugins_file(&temp.path().join("config/plugins.toml"))
                .unwrap()
                .plugins
                .is_empty()
        );
    }

    #[tokio::test]
    async fn inspects_and_installs_deduplicated_font_files() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        serve_fonts(&downloader, COMMIT_V1, MANIFEST_WITH_FONTS, b"wOF2font-v1");
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader.clone());

        let inspection = manager.inspect("Alice/rencal-dusk").await.unwrap();
        assert_eq!(inspection.fonts.len(), 2);
        assert_eq!(inspection.fonts[0].family, "Pixel");
        assert_eq!(inspection.fonts[0].weight, 400);
        assert_eq!(inspection.fonts[1].weight, 700);

        manager.install("Alice/rencal-dusk").await.unwrap();
        let font_path = temp
            .path()
            .join("data/plugins/alice.dusk/fonts/pixel.woff2");
        assert_eq!(std::fs::read(font_path).unwrap(), b"wOF2font-v1");
        let request_path = format!("/Alice/rencal-dusk/{COMMIT_V1}/fonts/pixel.woff2");
        assert_eq!(downloader.request_count(&request_path), 1);
    }

    #[tokio::test]
    async fn invalid_font_downloads_do_not_replace_an_installed_package() {
        for (status, font) in [
            (404, Vec::new()),
            (200, vec![b'x'; FONT_FILE_LIMIT + 1]),
            (200, b"not-a-woff2".to_vec()),
        ] {
            let downloader = Arc::new(FixtureDownloader::new());
            serve_v1(&downloader);
            let temp = tempfile::tempdir().unwrap();
            let manager = manager(&temp, downloader.clone());
            manager.install("Alice/rencal-dusk").await.unwrap();

            let manifest_v2 = MANIFEST_WITH_FONTS.replace("1.0.0", "2.0.0");
            downloader.set(
                "/repos/Alice/rencal-dusk/releases/latest",
                200,
                br#"{"tag_name":"v2.0.0"}"#.to_vec(),
            );
            downloader.set(
                "/repos/Alice/rencal-dusk/commits?sha=v2.0.0&per_page=1",
                200,
                format!(r#"[{{"sha":"{COMMIT_V2}"}}]"#).into_bytes(),
            );
            serve_fonts(&downloader, COMMIT_V2, &manifest_v2, &font);
            downloader.set(
                &format!("/Alice/rencal-dusk/{COMMIT_V2}/fonts/pixel.woff2"),
                status,
                font,
            );

            assert!(manager.install("Alice/rencal-dusk").await.is_err());
            assert_eq!(
                std::fs::read_to_string(
                    temp.path().join("data/plugins/alice.dusk/themes/dark.css")
                )
                .unwrap(),
                "--background: #111;"
            );
            assert_eq!(
                load_plugin_lock_file(&temp.path().join("data/plugins.lock"))
                    .unwrap()
                    .plugins[0]
                    .version,
                "1.0.0"
            );
        }
    }

    #[tokio::test]
    async fn package_limit_counts_font_bytes() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let manifest = MANIFEST_WITH_FONTS
            .replace(
                "[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"fonts/pixel.woff2\"\nweight = 700\n",
                "[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"fonts/two.woff2\"\nweight = 700\n\n[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"fonts/three.woff2\"\nweight = 900\n",
            );
        downloader.set(
            &format!("/Alice/rencal-dusk/{COMMIT_V1}/rencal-plugin.toml"),
            200,
            manifest,
        );
        downloader.set(
            &format!("/Alice/rencal-dusk/{COMMIT_V1}/themes/dark.css"),
            200,
            vec![b'c'; CSS_FILE_LIMIT],
        );
        for file in ["pixel.woff2", "two.woff2", "three.woff2"] {
            let mut bytes = vec![0; FONT_FILE_LIMIT];
            bytes[..4].copy_from_slice(b"wOF2");
            downloader.set(
                &format!("/Alice/rencal-dusk/{COMMIT_V1}/fonts/{file}"),
                200,
                bytes,
            );
        }
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);

        let error = manager.install("Alice/rencal-dusk").await.unwrap_err();
        assert!(error.to_string().contains("package exceeds"));
        assert!(!temp.path().join("data/plugins/alice.dusk").exists());
    }

    #[tokio::test]
    async fn updating_replaces_font_bytes() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        serve_fonts(&downloader, COMMIT_V1, MANIFEST_WITH_FONTS, b"wOF2font-v1");
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader.clone());
        manager.install("Alice/rencal-dusk").await.unwrap();

        downloader.set(
            "/repos/Alice/rencal-dusk/releases/latest",
            200,
            br#"{"tag_name":"v2.0.0"}"#.to_vec(),
        );
        downloader.set(
            "/repos/Alice/rencal-dusk/commits?sha=v2.0.0&per_page=1",
            200,
            format!(r#"[{{"sha":"{COMMIT_V2}"}}]"#).into_bytes(),
        );
        serve_fonts(
            &downloader,
            COMMIT_V2,
            &MANIFEST_WITH_FONTS.replace("1.0.0", "2.0.0"),
            b"wOF2font-v2",
        );

        manager.install("Alice/rencal-dusk").await.unwrap();
        assert_eq!(
            std::fs::read(
                temp.path()
                    .join("data/plugins/alice.dusk/fonts/pixel.woff2")
            )
            .unwrap(),
            b"wOF2font-v2"
        );
    }

    #[tokio::test]
    async fn installs_default_branch_head_without_a_release() {
        let downloader = Arc::new(FixtureDownloader::new());
        downloader.set(
            "/repos/Alice/rencal-dusk/commits?per_page=1",
            200,
            format!(r#"[{{"sha":"{COMMIT_V1}"}}]"#).into_bytes(),
        );
        downloader.set(
            &format!("/Alice/rencal-dusk/{COMMIT_V1}/rencal-plugin.toml"),
            200,
            MANIFEST_V1.as_bytes().to_vec(),
        );
        downloader.set(
            &format!("/Alice/rencal-dusk/{COMMIT_V1}/themes/dark.css"),
            200,
            b"--background: #111;".to_vec(),
        );
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);

        let inspection = manager.install("Alice/rencal-dusk").await.unwrap();

        assert_eq!(inspection.version, "1.0.0");
        let locks = load_plugin_lock_file(&temp.path().join("data/plugins.lock")).unwrap();
        assert_eq!(locks.plugins[0].commit, COMMIT_V1);
    }

    #[tokio::test]
    async fn accepts_release_metadata_with_long_notes() {
        let downloader = Arc::new(FixtureDownloader::new());
        let release = format!(
            r#"{{"tag_name":"v1.0.0","body":"{}"}}"#,
            "x".repeat(125 * 1024)
        );
        downloader.set(
            "/repos/Alice/rencal-dusk/releases/latest",
            200,
            release.into_bytes(),
        );
        downloader.set(
            "/repos/Alice/rencal-dusk/commits?sha=v1.0.0&per_page=1",
            200,
            format!(r#"[{{"sha":"{COMMIT_V1}"}}]"#).into_bytes(),
        );
        downloader.set(
            &format!("/Alice/rencal-dusk/{COMMIT_V1}/rencal-plugin.toml"),
            200,
            MANIFEST_V1.as_bytes().to_vec(),
        );
        downloader.set(
            &format!("/Alice/rencal-dusk/{COMMIT_V1}/themes/dark.css"),
            200,
            b"--background: #111;".to_vec(),
        );
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);

        let inspection = manager.inspect("Alice/rencal-dusk").await.unwrap();

        assert_eq!(inspection.version, "1.0.0");
    }

    #[tokio::test]
    async fn failed_update_keeps_the_old_package_and_declaration() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader.clone());
        manager.install("Alice/rencal-dusk").await.unwrap();

        let manifest_v2 = MANIFEST_V1.replace("1.0.0", "2.0.0");
        downloader.set(
            "/repos/Alice/rencal-dusk/releases/latest",
            200,
            br#"{"tag_name":"v2.0.0"}"#.to_vec(),
        );
        downloader.set(
            "/repos/Alice/rencal-dusk/commits?sha=v2.0.0&per_page=1",
            200,
            format!(r#"[{{"sha":"{COMMIT_V2}"}}]"#).into_bytes(),
        );
        downloader.set(
            &format!("/Alice/rencal-dusk/{COMMIT_V2}/rencal-plugin.toml"),
            200,
            manifest_v2.into_bytes(),
        );
        let error = manager.install("Alice/rencal-dusk").await.unwrap_err();
        assert_eq!(error.kind, PluginInstallErrorKind::InvalidPackage);
        assert_eq!(
            std::fs::read_to_string(temp.path().join("data/plugins/alice.dusk/themes/dark.css"))
                .unwrap(),
            "--background: #111;"
        );
        let locks = load_plugin_lock_file(&temp.path().join("data/plugins.lock")).unwrap();
        assert_eq!(locks.plugins[0].version, "1.0.0");
    }

    #[tokio::test]
    async fn restores_the_exact_declared_commit() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_fonts(&downloader, COMMIT_V1, MANIFEST_WITH_FONTS, b"wOF2restored");
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        save_plugins_file(
            &temp.path().join("config/plugins.toml"),
            &PluginsFile {
                plugins: vec!["Alice/rencal-dusk".into()],
            },
        )
        .unwrap();
        save_plugin_lock_file(
            &temp.path().join("data/plugins.lock"),
            &PluginLockFile {
                plugins: vec![PluginLockEntry {
                    id: "alice.dusk".into(),
                    repo: "Alice/rencal-dusk".into(),
                    version: "1.0.0".into(),
                    commit: COMMIT_V1.into(),
                }],
                local: Vec::new(),
            },
        )
        .unwrap();

        assert!(manager.reconcile().await.is_empty());
        assert!(temp.path().join("data/plugins/alice.dusk").is_dir());
        assert_eq!(
            std::fs::read(
                temp.path()
                    .join("data/plugins/alice.dusk/fonts/pixel.woff2")
            )
            .unwrap(),
            b"wOF2restored"
        );
    }

    #[tokio::test]
    async fn resolves_a_repository_only_declaration_and_writes_the_lockfile() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        save_plugins_file(
            &temp.path().join("config/plugins.toml"),
            &PluginsFile {
                plugins: vec!["Alice/rencal-dusk".into()],
            },
        )
        .unwrap();

        assert!(manager.reconcile().await.is_empty());
        assert!(temp.path().join("data/plugins/alice.dusk").is_dir());
        let locks = load_plugin_lock_file(&temp.path().join("data/plugins.lock")).unwrap();
        assert_eq!(locks.plugins[0].id, "alice.dusk");
        assert_eq!(locks.plugins[0].version, "1.0.0");
        assert_eq!(locks.plugins[0].commit, COMMIT_V1);
    }

    #[tokio::test]
    async fn restore_does_not_readd_a_declaration_removed_during_download() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let (started, resume) =
            downloader.pause_on(format!("/Alice/rencal-dusk/{COMMIT_V1}/themes/dark.css"));
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        let declarations_path = temp.path().join("config/plugins.toml");
        save_plugins_file(
            &declarations_path,
            &PluginsFile {
                plugins: vec!["Alice/rencal-dusk".into()],
            },
        )
        .unwrap();

        let task = tokio::spawn({
            let manager = manager.clone();
            async move { manager.reconcile().await }
        });
        started.notified().await;
        save_plugins_file(&declarations_path, &PluginsFile::default()).unwrap();
        resume.notify_one();

        assert!(task.await.unwrap().is_empty());
        assert!(
            load_plugins_file(&declarations_path)
                .unwrap()
                .plugins
                .is_empty()
        );
        assert!(!temp.path().join("data/plugins/alice.dusk").exists());
        assert!(
            load_plugin_lock_file(&temp.path().join("data/plugins.lock"))
                .unwrap()
                .plugins
                .is_empty()
        );
    }

    #[tokio::test]
    async fn reconcile_prunes_undeclared_managed_packages_only() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        manager.install("Alice/rencal-dusk").await.unwrap();
        let manual = temp.path().join("data/plugins/local.manual");
        std::fs::create_dir_all(&manual).unwrap();
        std::fs::write(manual.join("notes.txt"), "unmanaged").unwrap();
        save_plugins_file(
            &temp.path().join("config/plugins.toml"),
            &PluginsFile::default(),
        )
        .unwrap();

        assert!(manager.reconcile().await.is_empty());

        assert!(!temp.path().join("data/plugins/alice.dusk").exists());
        assert!(manual.is_dir());
        assert!(
            load_plugin_lock_file(&temp.path().join("data/plugins.lock"))
                .unwrap()
                .plugins
                .is_empty()
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn reconcile_leaves_an_unlocked_symlinked_checkout_alone() {
        use std::os::unix::fs::symlink;

        let downloader = Arc::new(FixtureDownloader::new());
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        let packages = temp.path().join("data/plugins");
        let checkout = temp.path().join("checkout");
        std::fs::create_dir_all(&packages).unwrap();
        std::fs::create_dir_all(&checkout).unwrap();
        symlink(&checkout, packages.join("local.checkout")).unwrap();

        assert!(manager.reconcile().await.is_empty());

        assert!(
            std::fs::symlink_metadata(packages.join("local.checkout"))
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert!(checkout.is_dir());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn reconcile_links_a_local_checkout_and_lists_it() {
        let downloader = Arc::new(FixtureDownloader::new());
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        let checkout = temp.path().join("checkout");
        write_local_checkout(&checkout);
        save_plugins_file(
            &temp.path().join("config/plugins.toml"),
            &PluginsFile {
                plugins: vec![checkout.display().to_string()],
            },
        )
        .unwrap();

        assert!(manager.reconcile().await.is_empty());
        let link = temp.path().join("data/plugins/alice.dusk");
        assert!(
            std::fs::symlink_metadata(&link)
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert_eq!(
            std::fs::canonicalize(link).unwrap(),
            checkout.canonicalize().unwrap()
        );
        let snapshot = manager.list().await;
        assert!(snapshot.errors.is_empty(), "{:?}", snapshot.errors);
        assert_eq!(snapshot.plugins[0].name, "Dusk");
        assert_eq!(snapshot.plugins[0].local_dir.as_deref(), checkout.to_str());
        assert_eq!(snapshot.plugins[0].repo, None);

        *manager.inner.catalog.lock().await = vec![PluginCatalogEntry {
            id: "alice.dusk".into(),
            name: "Dusk".into(),
            repo: "Alice/rencal-dusk".into(),
            description: "A newer Dusk".into(),
            version: "9.0.0".into(),
            preview_url: None,
        }];
        assert!(manager.list().await.plugins[0].update_version.is_none());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn reconcile_repoints_and_prunes_local_checkouts_without_touching_them() {
        let downloader = Arc::new(FixtureDownloader::new());
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        let first = temp.path().join("first");
        let second = temp.path().join("second");
        write_local_checkout(&first);
        write_local_checkout(&second);
        let declarations_path = temp.path().join("config/plugins.toml");
        save_plugins_file(
            &declarations_path,
            &PluginsFile {
                plugins: vec![first.display().to_string()],
            },
        )
        .unwrap();
        assert!(manager.reconcile().await.is_empty());

        save_plugins_file(
            &declarations_path,
            &PluginsFile {
                plugins: vec![second.display().to_string()],
            },
        )
        .unwrap();
        assert!(manager.reconcile().await.is_empty());
        let link = temp.path().join("data/plugins/alice.dusk");
        assert_eq!(
            std::fs::canonicalize(&link).unwrap(),
            second.canonicalize().unwrap()
        );
        assert!(first.join(MANIFEST_FILE).is_file());

        save_plugins_file(&declarations_path, &PluginsFile::default()).unwrap();
        assert!(manager.reconcile().await.is_empty());
        assert!(std::fs::symlink_metadata(link).is_err());
        assert!(second.join(MANIFEST_FILE).is_file());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn local_checkout_shadows_managed_install_and_restores_locked_commit() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader.clone());
        manager.install("Alice/rencal-dusk").await.unwrap();
        let checkout = temp.path().join("checkout");
        write_local_checkout(&checkout);
        let declarations_path = temp.path().join("config/plugins.toml");
        save_plugins_file(
            &declarations_path,
            &PluginsFile {
                plugins: vec!["Alice/rencal-dusk".into(), checkout.display().to_string()],
            },
        )
        .unwrap();

        assert!(manager.reconcile().await.is_empty());
        let link = temp.path().join("data/plugins/alice.dusk");
        assert!(
            std::fs::symlink_metadata(&link)
                .unwrap()
                .file_type()
                .is_symlink()
        );
        let locks = load_plugin_lock_file(&temp.path().join("data/plugins.lock")).unwrap();
        assert_eq!(locks.plugins[0].commit, COMMIT_V1);
        assert_eq!(locks.local[0].id, "alice.dusk");

        save_plugins_file(
            &declarations_path,
            &PluginsFile {
                plugins: vec!["Alice/rencal-dusk".into()],
            },
        )
        .unwrap();
        assert!(manager.reconcile().await.is_empty());
        assert!(
            !std::fs::symlink_metadata(&link)
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert_eq!(
            std::fs::read_to_string(link.join("themes/dark.css")).unwrap(),
            "--background: #111;"
        );
        assert_eq!(
            downloader.request_count("/repos/Alice/rencal-dusk/releases/latest"),
            1
        );
        assert_eq!(
            downloader.request_count(&format!(
                "/Alice/rencal-dusk/{COMMIT_V1}/rencal-plugin.toml"
            )),
            2
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn repository_added_while_local_exists_records_lock_without_replacing_link() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader.clone());
        let checkout = temp.path().join("checkout");
        write_local_checkout(&checkout);
        let declarations_path = temp.path().join("config/plugins.toml");
        save_plugins_file(
            &declarations_path,
            &PluginsFile {
                plugins: vec![checkout.display().to_string()],
            },
        )
        .unwrap();
        assert!(manager.reconcile().await.is_empty());

        save_plugins_file(
            &declarations_path,
            &PluginsFile {
                plugins: vec![checkout.display().to_string(), "Alice/rencal-dusk".into()],
            },
        )
        .unwrap();
        assert!(manager.reconcile().await.is_empty());
        let requests = downloader.request_count("/repos/Alice/rencal-dusk/releases/latest");
        assert_eq!(requests, 1);
        assert!(manager.reconcile().await.is_empty());
        assert_eq!(
            downloader.request_count("/repos/Alice/rencal-dusk/releases/latest"),
            requests
        );
        assert_eq!(
            std::fs::canonicalize(temp.path().join("data/plugins/alice.dusk")).unwrap(),
            checkout.canonicalize().unwrap()
        );
        let listed = manager.list().await;
        assert_eq!(listed.plugins[0].repo.as_deref(), Some("Alice/rencal-dusk"));
        assert_eq!(listed.plugins[0].local_dir.as_deref(), checkout.to_str());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn install_refuses_a_locally_provided_id_and_uninstall_removes_it() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        let checkout = temp.path().join("checkout");
        write_local_checkout(&checkout);
        let declarations_path = temp.path().join("config/plugins.toml");
        save_plugins_file(
            &declarations_path,
            &PluginsFile {
                plugins: vec![checkout.display().to_string()],
            },
        )
        .unwrap();
        assert!(manager.reconcile().await.is_empty());

        let error = manager.install("Alice/rencal-dusk").await.unwrap_err();
        assert_eq!(error.kind, PluginInstallErrorKind::InvalidInput);
        assert!(error.to_string().contains("provided by the local checkout"));
        manager.uninstall("alice.dusk").await.unwrap();
        assert!(
            load_plugins_file(&declarations_path)
                .unwrap()
                .plugins
                .is_empty()
        );
        assert!(
            load_plugin_lock_file(&temp.path().join("data/plugins.lock"))
                .unwrap()
                .local
                .is_empty()
        );
        assert!(checkout.join(MANIFEST_FILE).is_file());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn invalid_local_declarations_are_listed_without_creating_links() {
        let downloader = Arc::new(FixtureDownloader::new());
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        let missing = temp.path().join("missing");
        save_plugins_file(
            &temp.path().join("config/plugins.toml"),
            &PluginsFile {
                plugins: vec![missing.display().to_string()],
            },
        )
        .unwrap();

        assert_eq!(manager.reconcile().await.len(), 1);
        let listed = manager.list().await;
        assert_eq!(listed.errors.len(), 1);
        assert!(listed.errors[0].contains(missing.to_str().unwrap()));
        assert!(!temp.path().join("data/plugins/alice.dusk").exists());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn unlocked_manual_directory_blocks_a_local_checkout() {
        let downloader = Arc::new(FixtureDownloader::new());
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        let checkout = temp.path().join("checkout");
        write_local_checkout(&checkout);
        let manual = temp.path().join("data/plugins/alice.dusk");
        std::fs::create_dir_all(&manual).unwrap();
        std::fs::write(manual.join("keep.txt"), "manual").unwrap();
        save_plugins_file(
            &temp.path().join("config/plugins.toml"),
            &PluginsFile {
                plugins: vec![checkout.display().to_string()],
            },
        )
        .unwrap();

        let errors = manager.reconcile().await;
        assert_eq!(errors.len(), 1);
        assert!(errors[0].message.contains("remove it by hand"));
        assert_eq!(
            std::fs::read_to_string(manual.join("keep.txt")).unwrap(),
            "manual"
        );
        let listed = manager.list().await;
        assert!(
            listed
                .errors
                .iter()
                .any(|error| error.contains("remove it by hand"))
        );
        assert!(
            load_plugin_lock_file(&temp.path().join("data/plugins.lock"))
                .unwrap()
                .local
                .is_empty()
        );
    }

    #[cfg(unix)]
    #[test]
    fn apply_local_rolls_back_filesystem_changes_when_lock_save_fails() {
        use std::os::unix::fs::symlink;

        let downloader = Arc::new(FixtureDownloader::new());
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        let packages = temp.path().join("data/plugins");
        std::fs::create_dir_all(packages.join("alice.dusk")).unwrap();
        std::fs::write(packages.join("alice.dusk/managed.txt"), "managed").unwrap();

        let old_bob = temp.path().join("old-bob");
        write_local_checkout_as(&old_bob, "bob.dawn");
        symlink(&old_bob, packages.join("bob.dawn")).unwrap();

        let alice = temp.path().join("alice");
        let bob = temp.path().join("bob");
        let carol = temp.path().join("carol");
        write_local_checkout_as(&alice, "alice.dusk");
        write_local_checkout_as(&bob, "bob.dawn");
        write_local_checkout_as(&carol, "carol.noon");
        let declarations = PluginsFile {
            plugins: vec![
                alice.display().to_string(),
                bob.display().to_string(),
                carol.display().to_string(),
            ],
        };
        let mut locks = PluginLockFile {
            plugins: vec![PluginLockEntry {
                id: "alice.dusk".into(),
                repo: "alice/rencal-dusk".into(),
                version: "1.0.0".into(),
                commit: COMMIT_V1.into(),
            }],
            local: vec![LocalLockEntry {
                id: "bob.dawn".into(),
                dir: old_bob.display().to_string(),
            }],
        };
        let previous_locks = locks.clone();
        std::fs::create_dir_all(&manager.inner.lock_path).unwrap();

        let errors = manager.apply_local(&declarations, &mut locks);

        assert_eq!(errors.len(), 1);
        assert_eq!(locks, previous_locks);
        assert_eq!(
            std::fs::read_to_string(packages.join("alice.dusk/managed.txt")).unwrap(),
            "managed"
        );
        assert_eq!(
            std::fs::canonicalize(packages.join("bob.dawn")).unwrap(),
            old_bob.canonicalize().unwrap()
        );
        assert!(std::fs::symlink_metadata(packages.join("carol.noon")).is_err());
        for checkout in [&alice, &bob, &carol, &old_bob] {
            assert!(checkout.join(MANIFEST_FILE).is_file());
        }
    }

    #[tokio::test]
    async fn reconcile_does_not_prune_when_declarations_are_malformed() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        manager.install("Alice/rencal-dusk").await.unwrap();
        std::fs::write(temp.path().join("config/plugins.toml"), "plugins = [").unwrap();

        let errors = manager.reconcile().await;

        assert_eq!(errors.len(), 1);
        assert!(errors[0].message.contains("could not parse"));
        assert!(temp.path().join("data/plugins/alice.dusk").is_dir());
        assert_eq!(
            load_plugin_lock_file(&temp.path().join("data/plugins.lock"))
                .unwrap()
                .plugins
                .len(),
            1
        );
    }

    #[tokio::test]
    async fn classifies_repository_release_and_rate_limit_failures() {
        let downloader = Arc::new(FixtureDownloader::new());
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader.clone());

        let invalid = manager.inspect("not-a-repository").await.unwrap_err();
        assert_eq!(invalid.kind, PluginInstallErrorKind::InvalidInput);

        let missing = manager.inspect("Alice/rencal-dusk").await.unwrap_err();
        assert_eq!(missing.kind, PluginInstallErrorKind::MissingRelease);

        downloader.set("/repos/Alice/rencal-dusk/releases/latest", 429, Vec::new());
        let limited = manager.inspect("Alice/rencal-dusk").await.unwrap_err();
        assert_eq!(limited.kind, PluginInstallErrorKind::RateLimited);
    }

    #[test]
    fn accepts_repository_coordinates_and_github_urls() {
        for value in [
            "Alice/rencal-dusk",
            "https://github.com/Alice/rencal-dusk",
            "https://github.com/Alice/rencal-dusk/",
            "https://github.com/Alice/rencal-dusk.git",
        ] {
            let repository = Repository::parse(value).unwrap();
            assert_eq!(repository.owner, "Alice");
            assert_eq!(repository.name, "rencal-dusk");
            assert_eq!(repository.display, "Alice/rencal-dusk");
        }
    }

    #[test]
    fn rejects_non_github_or_non_repository_urls() {
        for value in [
            "http://github.com/Alice/rencal-dusk",
            "https://example.com/Alice/rencal-dusk",
            "https://github.com/Alice/rencal-dusk/issues",
            "https://github.com/Alice/rencal-dusk?tab=readme",
        ] {
            let error = Repository::parse(value).unwrap_err();
            assert_eq!(error.kind, PluginInstallErrorKind::InvalidInput);
        }
    }
}
