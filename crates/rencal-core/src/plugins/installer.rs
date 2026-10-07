//! GitHub-backed installation for theme and provider packages.
//!
//! Package files come from a pinned commit; provider binaries come from the
//! matching release's assets and are verified against their sha256 digest.
//! Downloads are bounded and written to a staging directory. Package swaps,
//! declarations, and lockfile updates are serialized so a failed install or
//! update can put the previous state back before returning.

use std::collections::HashSet;
use std::future::Future;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt;
use reqwest::{StatusCode, Url};
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::sync::Mutex;

#[cfg(unix)]
use super::LocalLockEntry;
use super::{
    Appearance, ContributionKind, FontStyle, LockedProviderAsset, MANIFEST_FILE, PluginDeclaration,
    PluginLockEntry, PluginLockFile, PluginManifest, PluginsFile, ProviderContribution,
    load_declared_plugins, load_plugin_lock_file, plugins_dir, plugins_file_path,
    plugins_lock_path, provider_binary_path, release_asset_sha256, running_app_version,
    save_plugin_lock_file, save_plugins_file, scan_packages, validate_manifest,
    validate_manifest_owner, validate_package_id,
};

const RELEASE_RESPONSE_LIMIT: usize = 1024 * 1024;
const MANIFEST_LIMIT: usize = 128 * 1024;
const CSS_FILE_LIMIT: usize = 1024 * 1024;
pub(crate) const FONT_FILE_LIMIT: usize = 1024 * 1024;
pub(super) const ICON_FILE_LIMIT: usize = 64 * 1024;
/// Local previews travel inline on every plugin list, so stay well below the catalog's 10 MiB.
const LOCAL_PREVIEW_LIMIT: usize = 4 * 1024 * 1024;
const PACKAGE_LIMIT: usize = 4 * 1024 * 1024;
/// Release archives are not part of `PACKAGE_LIMIT`; Tuta's are about 4 MB.
const PROVIDER_ARCHIVE_LIMIT: usize = 64 * 1024 * 1024;
const PROVIDER_BINARY_LIMIT: u64 = 256 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const CATALOG_URL: &str = "https://rencal.org/plugins.json";

/// Release targets this host can run, most preferred first. Static musl builds
/// come before gnu ones because they do not depend on the system glibc.
const HOST_TARGETS: &[&str] = if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
    &["x86_64-unknown-linux-musl", "x86_64-unknown-linux-gnu"]
} else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
    &["aarch64-unknown-linux-musl", "aarch64-unknown-linux-gnu"]
} else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
    &["aarch64-apple-darwin"]
} else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
    &["x86_64-apple-darwin"]
} else {
    &[]
};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct InstalledPlugin {
    pub id: String,
    pub name: String,
    /// From the installed manifest, for plugins the catalog doesn't list.
    pub description: Option<String>,
    pub contributions: Vec<ContributionKind>,
    /// Local checkouts only: their `preview.png` as a `data:` URL.
    pub preview_url: Option<String>,
    pub repo: Option<String>,
    pub local_dir: Option<String>,
    pub version: Option<String>,
    pub update_version: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct InstalledPlugins {
    pub plugins: Vec<InstalledPlugin>,
    pub errors: Vec<String>,
}

/// The catalog is a JSON array. Extra indexer metadata is ignored by the app.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct PluginCatalogEntry {
    pub id: String,
    pub name: String,
    pub repo: String,
    pub description: String,
    // The release tag, or the default-branch commit for unreleased themes.
    pub tag: String,
    #[serde(default, deserialize_with = "deserialize_contributions")]
    pub contributions: Vec<ContributionKind>,
    #[serde(default, deserialize_with = "deserialize_preview_url")]
    pub preview_url: Option<String>,
    #[serde(default)]
    pub stars: u32,
    #[serde(default)]
    pub released_at: Option<String>,
}

/// Kinds added by a newer indexer are dropped rather than hiding the plugin.
fn deserialize_contributions<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<ContributionKind>, D::Error> {
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|kind| ContributionKind::deserialize(kind).ok())
        .collect())
}

/// Preview metadata is optional: bad values must never hide an installable plugin.
fn deserialize_preview_url<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(value
        .as_str()
        .filter(|url| is_preview_url(url))
        .map(str::to_owned))
}

/// A catalog preview: a content-addressed PNG on rencal.org.
fn is_preview_url(url: &str) -> bool {
    url.strip_prefix("https://rencal.org/plugin-previews/")
        .and_then(|filename| filename.strip_suffix(".png"))
        .is_some_and(|hash| {
            hash.len() == 64
                && hash
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        })
}

/// Downloads a catalog preview image. Only the catalog's preview URLs are
/// fetched (what the webview's CSP allowed before).
pub async fn fetch_preview(url: &str) -> Result<Vec<u8>, PluginInstallError> {
    if !is_preview_url(url) {
        return Err(PluginInstallError::new(
            PluginInstallErrorKind::InvalidInput,
            format!("not a plugin preview URL: {url}"),
        ));
    }
    let network = |error: reqwest::Error| {
        PluginInstallError::new(PluginInstallErrorKind::Network, error.to_string())
    };
    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = reqwest::Client::builder()
        .user_agent(format!("renCal/{}", env!("CARGO_PKG_VERSION")))
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(network)?;
    let response = client
        .get(url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(network)?;
    Ok(response.bytes().await.map_err(network)?.to_vec())
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
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

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct PluginThemeInspection {
    pub id: String,
    pub name: String,
    pub appearance: Appearance,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct PluginFontInspection {
    pub family: String,
    pub file: String,
    pub weight: u16,
    pub style: FontStyle,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct PluginProviderInspection {
    pub slug: String,
    pub name: String,
    /// This platform's release asset, or `None` when the release has none.
    pub asset: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct PluginInspection {
    pub id: String,
    pub name: String,
    pub description: String,
    pub repo: String,
    // The release tag, or the short commit for default-branch installs.
    pub version: String,
    pub min_rencal_version: String,
    pub compatible: bool,
    pub themes: Vec<PluginThemeInspection>,
    pub fonts: Vec<PluginFontInspection>,
    pub providers: Vec<PluginProviderInspection>,
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
    urls: GithubUrls,
    targets: &'static [&'static str],
    declarations_path: PathBuf,
    lock_path: PathBuf,
    packages_dir: PathBuf,
    mutations: Mutex<()>,
    catalog: Mutex<Vec<PluginCatalogEntry>>,
}

struct GithubUrls {
    api: Url,
    raw: Url,
    /// Base for release asset downloads.
    web: Url,
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
    tag: Option<String>,
    providers: Vec<ResolvedProvider>,
}

struct ResolvedProvider {
    contribution: ProviderContribution,
    /// This host's release asset, or `None` when the release has none.
    asset: Option<LockedProviderAsset>,
}

impl ResolvedPackage {
    fn set_providers(&mut self, providers: Vec<ResolvedProvider>) {
        self.inspection.providers = providers
            .iter()
            .map(|provider| PluginProviderInspection {
                slug: provider.contribution.slug.clone(),
                name: provider.contribution.name.clone(),
                asset: provider.asset.as_ref().map(|asset| asset.asset.clone()),
            })
            .collect();
        self.providers = providers;
    }

    fn lock_entry(&self, repository: &Repository) -> PluginLockEntry {
        PluginLockEntry {
            id: self.manifest.id.clone(),
            repo: repository.display.clone(),
            commit: self.commit.clone(),
            tag: self.tag.clone(),
            providers: self
                .providers
                .iter()
                .filter_map(|provider| provider.asset.clone())
                .collect(),
        }
    }
}

#[derive(Clone, Copy)]
enum PackageFile {
    Css,
    Font,
    Icon,
}

#[derive(Clone, Copy)]
enum DeclarationPolicy {
    Ensure,
    RequireExisting,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    #[serde(default)]
    assets: Vec<GithubAsset>,
}

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    /// `sha256:<hex>`; missing on assets uploaded before GitHub added digests.
    digest: Option<String>,
}

#[derive(Deserialize)]
struct GithubCommit {
    sha: String,
}

enum MissingResponse {
    Release,
    Commit,
    PackageFile(String),
    ReleaseAsset(String),
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
        Self::new(declarations_path, lock_path, packages_dir)
    }

    fn new(
        declarations_path: PathBuf,
        lock_path: PathBuf,
        packages_dir: PathBuf,
    ) -> Result<Self, PluginInstallError> {
        // reqwest intentionally leaves provider choice to the application.
        // Installing ring is idempotent; another Tauri plugin may have done it.
        let _ = rustls::crypto::ring::default_provider().install_default();
        let client = reqwest::Client::builder()
            .user_agent(format!("renCal/{}", env!("CARGO_PKG_VERSION")))
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|error| {
                PluginInstallError::new(
                    PluginInstallErrorKind::Network,
                    format!("could not create GitHub client: {error}"),
                )
            })?;
        let urls = GithubUrls {
            api: Url::parse("https://api.github.com/").expect("valid GitHub API URL"),
            raw: Url::parse("https://raw.githubusercontent.com/").expect("valid GitHub raw URL"),
            web: Url::parse("https://github.com/").expect("valid GitHub URL"),
        };
        Ok(Self::with_downloader(
            declarations_path,
            lock_path,
            packages_dir,
            urls,
            HOST_TARGETS,
            Arc::new(ReqwestDownloader { client }),
        ))
    }

    fn with_downloader(
        declarations_path: PathBuf,
        lock_path: PathBuf,
        packages_dir: PathBuf,
        urls: GithubUrls,
        targets: &'static [&'static str],
        downloader: Arc<dyn Downloader>,
    ) -> Self {
        Self {
            inner: Arc::new(PluginManagerInner {
                downloader,
                urls,
                targets,
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
        let (declarations, locks) = self.load_declared_state().unwrap_or_else(|error| {
            errors.push(error.to_string());
            (Some(PluginsFile::default()), PluginLockFile::default())
        });
        let declarations = declarations.unwrap_or_else(|| {
            errors.extend(self.undeclared_warning(&locks));
            PluginsFile::default()
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
                version: Some(display_version(entry.reference())),
                name: entry.id.clone(),
                id: entry.id,
                repo: Some(entry.repo),
                local_dir: None,
                update_version: None,
                description: None,
                contributions: Vec::new(),
                preview_url: None,
                error: Some(
                    "Package files are missing. Install the repository again to restore it.".into(),
                ),
            })
            .collect();
        for package in scan.packages {
            let contributions = [
                (!package.themes.is_empty()).then_some(ContributionKind::Theme),
                (!package.providers.is_empty()).then_some(ContributionKind::Provider),
            ]
            .into_iter()
            .flatten()
            .collect();
            if let Some(row) = plugins.iter_mut().find(|row| row.id == package.id) {
                row.name = package.name;
                row.description = Some(package.description);
                row.contributions = contributions;
                row.error = None;
            } else {
                plugins.push(InstalledPlugin {
                    id: package.id,
                    name: package.name,
                    description: Some(package.description),
                    contributions,
                    preview_url: None,
                    repo: None,
                    local_dir: None,
                    version: None,
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
                    description: None,
                    contributions: Vec::new(),
                    preview_url: None,
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
            let preview_url = local_preview_data_url(Path::new(&entry.dir));
            if let Some(row) = plugins.iter_mut().find(|row| row.id == entry.id) {
                row.local_dir = Some(entry.dir.clone());
                row.preview_url = preview_url;
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
                    description: None,
                    contributions: Vec::new(),
                    preview_url,
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
            let Some(installed) = locks.plugins.iter().find(|entry| {
                entry.id == row.id
                    && row
                        .repo
                        .as_ref()
                        .is_some_and(|repo| repo.eq_ignore_ascii_case(&entry.repo))
            }) else {
                continue;
            };
            row.update_version = catalog
                .iter()
                .find(|entry| {
                    entry.id == installed.id
                        && entry.repo.eq_ignore_ascii_case(&installed.repo)
                        && is_update(&entry.tag, installed.reference())
                })
                .map(|entry| display_version(&entry.tag));
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
            if entry.name.trim().is_empty() || entry.tag.trim().is_empty() || !ids.insert(&entry.id)
            {
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
        self.require_installable(&package)?;
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
            let (declarations, mut locks) = match self.load_declared_state() {
                Ok((Some(declarations), locks)) => (declarations, locks),
                // Nothing is declared, so there is nothing to link or restore.
                Ok((None, locks)) => {
                    return self
                        .undeclared_warning(&locks)
                        .map(|message| PluginReconcileError {
                            package: self.inner.declarations_path.display().to_string(),
                            message,
                        })
                        .into_iter()
                        .collect();
                }
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

    /// Restore one declared repository. Locked commits and provider assets are
    /// fetched exactly; new declarations resolve the latest release.
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
            Some(entry) => self.resolve_locked(&repository, entry).await?,
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
        // Keep a locked package whose providers became unusable, as an update
        // may fix them; a new declaration must be installable like `install`.
        if locked.is_none() {
            self.require_installable(&package)?;
        }
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

    fn load_state(&self) -> Result<(PluginsFile, PluginLockFile), PluginInstallError> {
        let (declarations, locks) = self.load_declared_state()?;
        Ok((declarations.unwrap_or_default(), locks))
    }

    /// Like `load_state`, but `None` means plugins.toml declares nothing yet.
    fn load_declared_state(
        &self,
    ) -> Result<(Option<PluginsFile>, PluginLockFile), PluginInstallError> {
        let declarations =
            load_declared_plugins(&self.inner.declarations_path).map_err(|error| {
                PluginInstallError::new(PluginInstallErrorKind::Configuration, error.to_string())
            })?;
        let locks = load_plugin_lock_file(&self.inner.lock_path).map_err(|error| {
            PluginInstallError::new(PluginInstallErrorKind::Configuration, error.to_string())
        })?;
        Ok((declarations, locks))
    }

    /// Explains why locked packages survive a missing or empty plugins.toml.
    fn undeclared_warning(&self, locks: &PluginLockFile) -> Option<String> {
        let ids: HashSet<_> = locks
            .plugins
            .iter()
            .map(|entry| &entry.id)
            .chain(locks.local.iter().map(|entry| &entry.id))
            .collect();
        if ids.is_empty() {
            return None;
        }
        let count = ids.len();
        let noun = if count == 1 { "plugin" } else { "plugins" };
        Some(format!(
            "{} is missing or has no plugins list; keeping {count} installed {noun}. Set `plugins = []` to remove them.",
            self.inner.declarations_path.display()
        ))
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
            let mut package = self
                .resolve_commit_ref(repository, commit, Some(&release.tag_name))
                .await?;
            let providers = package
                .manifest
                .contributes
                .providers
                .iter()
                .map(|contribution| {
                    Ok(ResolvedProvider {
                        contribution: contribution.clone(),
                        asset: release_asset(&release, contribution, self.inner.targets)?,
                    })
                })
                .collect::<Result<_, PluginInstallError>>()?;
            package.set_providers(providers);
            return Ok(package);
        }

        let commit = self.resolve_commit(repository, None).await?;
        let package = self.resolve_commit_ref(repository, commit, None).await?;
        if !package.manifest.contributes.providers.is_empty() {
            return Err(PluginInstallError::new(
                PluginInstallErrorKind::MissingRelease,
                "provider plugins must be installed from a release",
            ));
        }
        Ok(package)
    }

    async fn resolve_locked(
        &self,
        repository: &Repository,
        entry: &PluginLockEntry,
    ) -> Result<ResolvedPackage, PluginInstallError> {
        let mut package = self
            .resolve_commit_ref(repository, entry.commit.clone(), entry.tag.as_deref())
            .await?;
        // Providers missing from the lock had no usable asset at install time.
        let providers = package
            .manifest
            .contributes
            .providers
            .iter()
            .map(|contribution| {
                let asset = entry
                    .providers
                    .iter()
                    .find(|locked| locked.slug == contribution.slug)
                    .cloned();
                if let Some(asset) = &asset
                    && asset.asset != contribution.asset_for(&asset.target)
                {
                    return Err(PluginInstallError::invalid_package(format!(
                        "locked asset {:?} does not match provider {:?}",
                        asset.asset, contribution.slug
                    )));
                }
                Ok(ResolvedProvider {
                    contribution: contribution.clone(),
                    asset,
                })
            })
            .collect::<Result<_, PluginInstallError>>()?;
        package.set_providers(providers);
        Ok(package)
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

        let minimum = Version::parse(&manifest.min_rencal_version)
            .expect("validated manifest minimum version");
        let compatible = running_app_version().is_none_or(|current| current >= minimum);
        let inspection = PluginInspection {
            id: manifest.id.clone(),
            name: manifest.name.clone(),
            description: manifest.description.clone(),
            repo: repository.display.clone(),
            version: display_version(release_tag.unwrap_or(&commit)),
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
            providers: Vec::new(),
        };
        Ok(ResolvedPackage {
            inspection,
            manifest,
            manifest_text,
            commit,
            tag: release_tag.map(str::to_owned),
            providers: Vec::new(),
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

    /// Providers without an asset for this host are skipped, which can leave
    /// nothing to install.
    fn require_installable(&self, package: &ResolvedPackage) -> Result<(), PluginInstallError> {
        if !package.manifest.contributes.themes.is_empty()
            || package
                .providers
                .iter()
                .any(|provider| provider.asset.is_some())
        {
            return Ok(());
        }
        let provider = &package
            .providers
            .first()
            .expect("validated manifests contribute a theme or provider")
            .contribution;
        let message = if self.inner.targets.is_empty() {
            "provider plugins are not supported on this platform".into()
        } else {
            format!(
                "{} has no release asset for this platform ({})",
                provider.name,
                self.inner.targets.join(", ")
            )
        };
        Err(PluginInstallError::new(
            PluginInstallErrorKind::Incompatible,
            message,
        ))
    }

    /// Accounts and provider storage key on the slug, so it has one owner.
    fn require_unique_providers(
        &self,
        manifest: &PluginManifest,
    ) -> Result<(), PluginInstallError> {
        let installed = scan_packages(&self.inner.packages_dir, None);
        for provider in &manifest.contributes.providers {
            if let Some(other) = installed.packages.iter().find(|package| {
                package.id != manifest.id
                    && package
                        .providers
                        .iter()
                        .any(|installed| installed.slug == provider.slug)
            }) {
                return Err(PluginInstallError::new(
                    PluginInstallErrorKind::InvalidInput,
                    format!(
                        "the {:?} provider is already installed by {} ({}); uninstall it first",
                        provider.slug, other.name, other.id
                    ),
                ));
            }
        }
        Ok(())
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
        self.require_unique_providers(&package.manifest)?;
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

            let entry = package.lock_entry(repository);
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
        let entry = package.lock_entry(repository);
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
                files.push((theme.css.as_str(), PackageFile::Css));
            }
        }
        for font in &package.manifest.contributes.fonts {
            if seen.insert(font.file.as_str()) {
                files.push((font.file.as_str(), PackageFile::Font));
            }
        }
        for provider in &package.manifest.contributes.providers {
            if let Some(icon) = &provider.icon
                && seen.insert(icon.as_str())
            {
                files.push((icon.as_str(), PackageFile::Icon));
            }
        }

        for (file, kind) in files {
            let limit = match kind {
                PackageFile::Css => CSS_FILE_LIMIT,
                PackageFile::Font => FONT_FILE_LIMIT,
                PackageFile::Icon => ICON_FILE_LIMIT,
            };
            let bytes = self
                .fetch_bounded(
                    self.raw_url(repository, &package.commit, file),
                    limit,
                    MissingResponse::PackageFile(file.to_owned()),
                )
                .await?;
            match kind {
                PackageFile::Font if !bytes.starts_with(b"wOF2") => {
                    return Err(PluginInstallError::invalid_package(format!(
                        "font file {file:?} does not have a valid WOFF2 signature"
                    )));
                }
                PackageFile::Icon if !is_svg(&bytes) => {
                    return Err(PluginInstallError::invalid_package(format!(
                        "provider icon {file:?} is not an SVG image"
                    )));
                }
                _ => {}
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

        for asset in package
            .providers
            .iter()
            .filter_map(|provider| provider.asset.as_ref())
        {
            let tag = package.tag.as_deref().ok_or_else(|| {
                PluginInstallError::invalid_package("provider binaries require a release")
            })?;
            self.stage_provider_binary(directory, repository, tag, asset)
                .await?;
        }
        Ok(())
    }

    /// Verify the archive against its digest before reading it, then extract
    /// only the provider binary.
    async fn stage_provider_binary(
        &self,
        directory: &Path,
        repository: &Repository,
        tag: &str,
        asset: &LockedProviderAsset,
    ) -> Result<(), PluginInstallError> {
        let archive = self
            .fetch_bounded(
                self.release_asset_url(repository, tag, &asset.asset),
                PROVIDER_ARCHIVE_LIMIT,
                MissingResponse::ReleaseAsset(asset.asset.clone()),
            )
            .await?;
        if sha256_hex(&archive) != asset.sha256 {
            return Err(PluginInstallError::invalid_package(format!(
                "release asset {:?} does not match its sha256 digest",
                asset.asset
            )));
        }
        extract_provider_binary(
            &archive,
            &asset.slug,
            &provider_binary_path(directory, &asset.slug),
        )
    }

    fn api_url(&self, repository: &Repository, suffix: &[&str]) -> Url {
        let mut url = self.inner.urls.api.clone();
        url.path_segments_mut()
            .expect("GitHub API base can be a path base")
            .extend(["repos", &repository.owner, &repository.name])
            .extend(suffix.iter().copied());
        url
    }

    fn raw_url(&self, repository: &Repository, reference: &str, path: &str) -> Url {
        let mut url = self.inner.urls.raw.clone();
        url.path_segments_mut()
            .expect("GitHub raw base can be a path base")
            .extend([&repository.owner, &repository.name, reference])
            .extend(path.split('/'));
        url
    }

    fn release_asset_url(&self, repository: &Repository, tag: &str, asset: &str) -> Url {
        let mut url = self.inner.urls.web.clone();
        url.path_segments_mut()
            .expect("GitHub base can be a path base")
            .extend([&repository.owner, &repository.name])
            .extend(["releases", "download", tag, asset]);
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
                MissingResponse::ReleaseAsset(name) => PluginInstallError::new(
                    PluginInstallErrorKind::MissingRelease,
                    format!("release asset {name:?} was not found"),
                ),
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
        // Allow large provider archives at least 256 KiB/s instead of the
        // client's fixed timeout.
        let timeout = REQUEST_TIMEOUT.max(Duration::from_secs((limit / (256 * 1024)) as u64));
        Box::pin(async move {
            let response = self
                .client
                .get(url)
                .timeout(timeout)
                .send()
                .await
                .map_err(|error| {
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

/// Releases are shown by tag, default-branch installs by short commit.
fn display_version(reference: &str) -> String {
    if validate_commit_sha(reference).is_ok() {
        reference[..7].to_owned()
    } else {
        reference.to_owned()
    }
}

/// Semantic release tags only update forwards, so a catalog that lags behind
/// a fresh install does not offer a downgrade. Other references update
/// whenever they differ.
fn is_update(latest: &str, installed: &str) -> bool {
    let semantic = |tag: &str| Version::parse(tag.strip_prefix('v').unwrap_or(tag)).ok();
    match (semantic(latest), semantic(installed)) {
        (Some(latest), Some(installed)) => latest.cmp_precedence(&installed).is_gt(),
        _ => latest != installed,
    }
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

/// Pick the first host target the release has an asset for. A matching asset
/// without a digest is a broken release, never an unverified download.
fn release_asset(
    release: &GithubRelease,
    provider: &ProviderContribution,
    targets: &[&str],
) -> Result<Option<LockedProviderAsset>, PluginInstallError> {
    let Some((target, asset)) = targets.iter().find_map(|target| {
        let name = provider.asset_for(target);
        release
            .assets
            .iter()
            .find(|asset| asset.name == name)
            .map(|asset| (*target, asset))
    }) else {
        return Ok(None);
    };
    let sha256 = asset
        .digest
        .as_deref()
        .and_then(release_asset_sha256)
        .ok_or_else(|| {
            PluginInstallError::invalid_package(format!(
                "release {} asset {:?} has no sha256 digest",
                release.tag_name, asset.name
            ))
        })?;
    Ok(Some(LockedProviderAsset {
        slug: provider.slug.clone(),
        target: target.to_owned(),
        asset: asset.name.clone(),
        sha256,
    }))
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// Extract `caldir-provider-<slug>` from the archive root or one directory
/// below it. Other entries are never written, but any entry that could escape
/// the archive, or a binary that is a link, rejects the whole archive.
fn extract_provider_binary(
    archive: &[u8],
    slug: &str,
    destination: &Path,
) -> Result<(), PluginInstallError> {
    let binary_name = format!("caldir-provider-{slug}");
    let unreadable = |error: std::io::Error| {
        PluginInstallError::invalid_package(format!("could not read provider archive: {error}"))
    };
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(archive));
    let mut found = false;
    for entry in archive.entries().map_err(unreadable)? {
        let mut entry = entry.map_err(unreadable)?;
        let path = entry.path().map_err(unreadable)?.into_owned();
        let mut depth = 0;
        for component in path.components() {
            match component {
                Component::Normal(_) => depth += 1,
                Component::CurDir => {}
                _ => {
                    return Err(PluginInstallError::invalid_package(format!(
                        "provider archive entry {:?} is not a relative path inside the archive",
                        path.display().to_string()
                    )));
                }
            }
        }
        if depth > 2
            || path
                .file_name()
                .is_none_or(|name| name != binary_name.as_str())
        {
            continue;
        }
        if !entry.header().entry_type().is_file() {
            return Err(PluginInstallError::invalid_package(format!(
                "{binary_name} in the provider archive is not a regular file"
            )));
        }
        if found {
            return Err(PluginInstallError::invalid_package(format!(
                "provider archive contains {binary_name} more than once"
            )));
        }
        found = true;
        write_provider_binary(&mut entry, &binary_name, destination)?;
    }
    if !found {
        return Err(PluginInstallError::invalid_package(format!(
            "provider archive does not contain {binary_name}"
        )));
    }
    Ok(())
}

fn write_provider_binary(
    source: &mut impl Read,
    binary_name: &str,
    destination: &Path,
) -> Result<(), PluginInstallError> {
    let parent = destination.parent().expect("provider binary is in bin/");
    std::fs::create_dir_all(parent).map_err(|error| {
        PluginInstallError::io(format!("could not create {}", parent.display()), error)
    })?;
    let mut file = std::fs::File::create(destination).map_err(|error| {
        PluginInstallError::io(format!("could not stage {}", destination.display()), error)
    })?;
    let written =
        std::io::copy(&mut source.take(PROVIDER_BINARY_LIMIT + 1), &mut file).map_err(|error| {
            PluginInstallError::io(format!("could not extract {binary_name}"), error)
        })?;
    if written > PROVIDER_BINARY_LIMIT {
        return Err(PluginInstallError::invalid_package(format!(
            "{binary_name} exceeds the {PROVIDER_BINARY_LIMIT} byte limit"
        )));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(std::fs::Permissions::from_mode(0o755))
            .map_err(|error| {
                PluginInstallError::io(format!("could not make {binary_name} executable"), error)
            })?;
    }
    Ok(())
}

/// Well-formed XML whose root element is `svg`.
pub(super) fn is_svg(bytes: &[u8]) -> bool {
    use quick_xml::events::Event;

    let mut reader = quick_xml::Reader::from_reader(bytes);
    let mut root = None;
    loop {
        match reader.read_event() {
            Ok(Event::Start(element) | Event::Empty(element)) if root.is_none() => {
                root = Some(element.local_name().as_ref() == b"svg");
            }
            Ok(Event::Eof) => return root == Some(true),
            Ok(_) => {}
            Err(_) => return false,
        }
    }
}

/// A local checkout's `preview.png` as a `data:` URL. Installed packages have
/// no preview; the catalog hosts theirs.
fn local_preview_data_url(dir: &Path) -> Option<String> {
    use base64::Engine;

    let mut bytes = Vec::new();
    std::fs::File::open(dir.join("preview.png"))
        .ok()?
        .take(LOCAL_PREVIEW_LIMIT as u64 + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    (bytes.len() <= LOCAL_PREVIEW_LIMIT && bytes.starts_with(b"\x89PNG\r\n\x1a\n")).then(|| {
        format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        )
    })
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
    use crate::plugins::load_plugins_file;
    use std::collections::HashMap;
    use std::sync::Mutex as StdMutex;
    use tokio::sync::Notify;

    const COMMIT_V1: &str = "1111111111111111111111111111111111111111";
    const COMMIT_V2: &str = "2222222222222222222222222222222222222222";
    const TEST_TARGETS: &[&str] = &["x86_64-unknown-linux-musl", "x86_64-unknown-linux-gnu"];

    const MANIFEST_V1: &str = r#"id = "alice.dusk"
name = "Dusk"
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
            GithubUrls {
                api: downloader.base.clone(),
                raw: downloader.base.clone(),
                web: downloader.base.clone(),
            },
            TEST_TARGETS,
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
    async fn catalog_offers_newer_tags_and_preserves_last_good_entries() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader.clone());
        manager.install("Alice/rencal-dusk").await.unwrap();

        for (tag, update) in [
            ("v1.0.0+build.2", None),
            ("v0.9.0", None),
            (COMMIT_V2, Some(&COMMIT_V2[..7])),
            ("v1.10.0", Some("v1.10.0")),
        ] {
            downloader.set(
                "/plugins.json",
                200,
                serde_json::to_vec(&serde_json::json!([{
                    "id": "alice.dusk", "name": "Dusk", "repo": "Alice/rencal-dusk",
                    "description": "A quiet theme", "tag": tag, "stars": 42
                }]))
                .unwrap(),
            );
            assert!(manager.catalog().await.error.is_none());
            let installed = manager.list().await;
            assert_eq!(installed.plugins[0].version.as_deref(), Some("v1.0.0"));
            assert_eq!(installed.plugins[0].update_version.as_deref(), update);
        }

        downloader.set("/plugins.json", 503, Vec::new());
        let catalog = manager.catalog().await;
        assert!(catalog.error.unwrap().contains("503"));
        assert_eq!(catalog.plugins[0].tag, "v1.10.0");
        downloader.set("/plugins.json", 200, b"not json".to_vec());
        let catalog = manager.catalog().await;
        assert!(catalog.error.is_some());
        assert_eq!(catalog.plugins[0].tag, "v1.10.0");

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
            "description":"Theme", "tag":"v1.0.0"
        }]"#
            .to_vec(),
        );
        let catalog = manager.catalog().await;
        assert!(catalog.error.unwrap().contains("does not match"));
        assert!(catalog.plugins.is_empty());
    }

    #[tokio::test]
    async fn catalog_ignores_unknown_contribution_kinds() {
        let downloader = Arc::new(FixtureDownloader::new());
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader.clone());
        downloader.set(
            "/plugins.json",
            200,
            br#"[
            {"id":"alice.dusk", "name":"Dusk", "repo":"alice/dusk", "description":"Theme",
             "tag":"v1.0.0", "contributions":["theme", "widget", 7, "provider"]},
            {"id":"alice.tuta", "name":"Tuta", "repo":"alice/tuta", "description":"Provider",
             "tag":"v1.0.0", "contributions":"provider"},
            {"id":"alice.old", "name":"Old", "repo":"alice/old", "description":"Theme",
             "tag":"v1.0.0"}
        ]"#
            .to_vec(),
        );
        let catalog = manager.catalog().await;
        assert!(catalog.error.is_none(), "{:?}", catalog.error);
        let kinds: Vec<_> = catalog
            .plugins
            .iter()
            .map(|plugin| plugin.contributions.as_slice())
            .collect();
        assert_eq!(
            kinds,
            [
                &[ContributionKind::Theme, ContributionKind::Provider][..],
                &[],
                &[],
            ]
        );
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
                    .commit,
                COMMIT_V1
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

        assert_eq!(inspection.version, &COMMIT_V1[..7]);
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

        assert_eq!(inspection.version, "v1.0.0");
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
        assert_eq!(locks.plugins[0].commit, COMMIT_V1);
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
                    commit: COMMIT_V1.into(),
                    tag: None,
                    providers: Vec::new(),
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
        assert!(snapshot.plugins[0].description.is_some());
        assert_eq!(
            snapshot.plugins[0].contributions,
            vec![ContributionKind::Theme]
        );
        assert_eq!(snapshot.plugins[0].preview_url, None);

        std::fs::write(checkout.join("preview.png"), b"\x89PNG\r\n\x1a\nrest").unwrap();
        let preview = manager.list().await.plugins[0].preview_url.clone().unwrap();
        assert!(preview.starts_with("data:image/png;base64,"));
        std::fs::write(checkout.join("preview.png"), b"not a png").unwrap();
        assert_eq!(manager.list().await.plugins[0].preview_url, None);

        *manager.inner.catalog.lock().await = vec![PluginCatalogEntry {
            id: "alice.dusk".into(),
            name: "Dusk".into(),
            repo: "Alice/rencal-dusk".into(),
            description: "A newer Dusk".into(),
            tag: "v9.0.0".into(),
            contributions: vec![ContributionKind::Theme],
            preview_url: None,
            stars: 0,
            released_at: None,
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
                commit: COMMIT_V1.into(),
                tag: None,
                providers: Vec::new(),
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

    fn assert_dusk_kept(temp: &tempfile::TempDir) {
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
    async fn reconcile_keeps_locked_plugins_when_declarations_are_missing() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        manager.install("Alice/rencal-dusk").await.unwrap();
        std::fs::remove_file(temp.path().join("config/plugins.toml")).unwrap();

        let errors = manager.reconcile().await;

        assert_eq!(errors.len(), 1);
        assert!(errors[0].message.contains("keeping 1 installed plugin"));
        assert_dusk_kept(&temp);
        assert_eq!(manager.list().await.errors, vec![errors[0].message.clone()]);
    }

    #[tokio::test]
    async fn reconcile_keeps_locked_plugins_when_declarations_are_empty() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        manager.install("Alice/rencal-dusk").await.unwrap();

        for contents in ["", " \n\n", "# plugins = []\n"] {
            std::fs::write(temp.path().join("config/plugins.toml"), contents).unwrap();
            assert_eq!(manager.reconcile().await.len(), 1, "{contents:?}");
            assert_dusk_kept(&temp);
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn reconcile_reports_a_dangling_declarations_symlink() {
        use std::os::unix::fs::symlink;

        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        manager.install("Alice/rencal-dusk").await.unwrap();
        let declarations_path = temp.path().join("config/plugins.toml");
        let target = temp.path().join("dotfiles/plugins.toml");
        std::fs::remove_file(&declarations_path).unwrap();
        symlink(&target, &declarations_path).unwrap();

        let errors = manager.reconcile().await;

        assert_eq!(errors.len(), 1);
        assert!(errors[0].message.contains("broken symlink"));
        assert!(errors[0].message.contains(&target.display().to_string()));
        assert_dusk_kept(&temp);
    }

    #[tokio::test]
    async fn reconcile_prunes_everything_for_an_explicit_empty_list() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        manager.install("Alice/rencal-dusk").await.unwrap();
        std::fs::write(temp.path().join("config/plugins.toml"), "plugins = []\n").unwrap();

        assert!(manager.reconcile().await.is_empty());
        assert!(!temp.path().join("data/plugins/alice.dusk").exists());
        assert!(
            load_plugin_lock_file(&temp.path().join("data/plugins.lock"))
                .unwrap()
                .plugins
                .is_empty()
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

    const TUTA_REPO: &str = "Alice/caldir-provider-tuta";
    const MUSL: &str = "x86_64-unknown-linux-musl";
    const GNU: &str = "x86_64-unknown-linux-gnu";
    const TUTA_ICON: &str = r##"<?xml version="1.0"?>
<!-- Tuta -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#850122" d="M0 0h24v24H0z"/></svg>
"##;

    const PROVIDER_MANIFEST: &str = r#"id = "alice.tuta"
name = "Tuta"
description = "Sync Tuta calendars"
min_rencal_version = "0.8.0"

[[contributes.providers]]
slug = "tuta"
name = "Tuta"
icon = "icons/tuta.svg"
bin = "caldir-provider-tuta-{target}.tar.gz"
"#;

    const MIXED_THEME: &str = r#"
[[contributes.themes]]
id = "dark"
name = "Tuta Dark"
css = "themes/dark.css"
appearance = "dark"
"#;

    fn tuta_asset(target: &str) -> String {
        format!("caldir-provider-tuta-{target}.tar.gz")
    }

    /// Entry names are written into the header directly: `set_path` refuses
    /// the unsafe paths these tests need.
    fn archive(entries: &[(&str, tar::EntryType, &[u8])]) -> Vec<u8> {
        let encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        let mut builder = tar::Builder::new(encoder);
        for (path, kind, data) in entries {
            let mut header = tar::Header::new_gnu();
            header.as_old_mut().name[..path.len()].copy_from_slice(path.as_bytes());
            header.set_entry_type(*kind);
            header.set_mode(0o755);
            header.set_size(data.len() as u64);
            if matches!(kind, tar::EntryType::Symlink | tar::EntryType::Link) {
                header.set_link_name("/usr/bin/true").unwrap();
            }
            header.set_cksum();
            builder.append(&header, *data).unwrap();
        }
        builder.into_inner().unwrap().finish().unwrap()
    }

    /// The layout of the caldir-provider-tuta release archives.
    fn tuta_archive(target: &str, binary: &[u8]) -> Vec<u8> {
        let directory = format!("caldir-provider-tuta-{target}");
        archive(&[
            (&format!("{directory}/"), tar::EntryType::Directory, b""),
            (
                &format!("{directory}/README.md"),
                tar::EntryType::Regular,
                b"readme",
            ),
            (
                &format!("{directory}/caldir-provider-tuta"),
                tar::EntryType::Regular,
                binary,
            ),
            (
                &format!("{directory}/LICENSE"),
                tar::EntryType::Regular,
                b"license",
            ),
        ])
    }

    /// Serve a release of `repo` whose assets are `(target, archive)` pairs.
    fn serve_provider(
        downloader: &FixtureDownloader,
        repo: &str,
        commit: &str,
        tag: &str,
        manifest: &str,
        assets: &[(&str, &[u8])],
    ) {
        let release_assets: Vec<_> = assets
            .iter()
            .map(|(target, bytes)| {
                serde_json::json!({
                    "name": tuta_asset(target),
                    "digest": format!("sha256:{}", sha256_hex(bytes)),
                })
            })
            .collect();
        downloader.set(
            &format!("/repos/{repo}/releases/latest"),
            200,
            serde_json::to_vec(&serde_json::json!({ "tag_name": tag, "assets": release_assets }))
                .unwrap(),
        );
        downloader.set(
            &format!("/repos/{repo}/commits?sha={tag}&per_page=1"),
            200,
            format!(r#"[{{"sha":"{commit}"}}]"#),
        );
        downloader.set(
            &format!("/{repo}/{commit}/rencal-plugin.toml"),
            200,
            manifest,
        );
        downloader.set(&format!("/{repo}/{commit}/icons/tuta.svg"), 200, TUTA_ICON);
        downloader.set(
            &format!("/{repo}/{commit}/themes/dark.css"),
            200,
            "--background: #850122;",
        );
        for (target, bytes) in assets {
            downloader.set(
                &format!("/{repo}/releases/download/{tag}/{}", tuta_asset(target)),
                200,
                *bytes,
            );
        }
    }

    fn tuta_package(temp: &tempfile::TempDir) -> PathBuf {
        temp.path().join("data/plugins/alice.tuta")
    }

    fn tuta_binary(temp: &tempfile::TempDir) -> PathBuf {
        tuta_package(temp).join("bin/caldir-provider-tuta")
    }

    fn locked_plugins(temp: &tempfile::TempDir) -> Vec<PluginLockEntry> {
        load_plugin_lock_file(&temp.path().join("data/plugins.lock"))
            .unwrap()
            .plugins
    }

    #[tokio::test]
    async fn installs_only_the_provider_binary_from_a_release_asset() {
        let downloader = Arc::new(FixtureDownloader::new());
        let archive = tuta_archive(GNU, b"tuta-gnu");
        serve_provider(
            &downloader,
            TUTA_REPO,
            COMMIT_V1,
            "v1.0.0",
            PROVIDER_MANIFEST,
            &[(GNU, &archive)],
        );
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);

        let inspection = manager.inspect(TUTA_REPO).await.unwrap();
        assert!(inspection.themes.is_empty());
        assert_eq!(
            inspection.providers,
            [PluginProviderInspection {
                slug: "tuta".into(),
                name: "Tuta".into(),
                asset: Some(tuta_asset(GNU)),
            }]
        );

        manager.install(TUTA_REPO).await.unwrap();

        assert_eq!(std::fs::read(tuta_binary(&temp)).unwrap(), b"tuta-gnu");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(tuta_binary(&temp))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o755);
        }
        assert_eq!(
            std::fs::read_to_string(tuta_package(&temp).join("icons/tuta.svg")).unwrap(),
            TUTA_ICON
        );
        let mut files: Vec<_> = std::fs::read_dir(tuta_package(&temp).join("bin"))
            .unwrap()
            .chain(std::fs::read_dir(tuta_package(&temp)).unwrap())
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .collect();
        files.sort();
        assert_eq!(
            files,
            ["bin", "caldir-provider-tuta", "icons", "rencal-plugin.toml"]
        );

        let locks = locked_plugins(&temp);
        assert_eq!(locks[0].tag.as_deref(), Some("v1.0.0"));
        assert_eq!(
            locks[0].providers,
            [LockedProviderAsset {
                slug: "tuta".into(),
                target: GNU.into(),
                asset: tuta_asset(GNU),
                sha256: sha256_hex(&archive),
            }]
        );
        let scan = scan_packages(&temp.path().join("data/plugins"), None);
        assert_eq!(
            scan.packages[0].providers[0].binary,
            Some(tuta_binary(&temp))
        );

        manager.uninstall("alice.tuta").await.unwrap();
        assert!(!tuta_package(&temp).exists());
    }

    #[tokio::test]
    async fn prefers_musl_provider_assets() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_provider(
            &downloader,
            TUTA_REPO,
            COMMIT_V1,
            "v1.0.0",
            PROVIDER_MANIFEST,
            &[
                (GNU, &tuta_archive(GNU, b"tuta-gnu")),
                (MUSL, &tuta_archive(MUSL, b"tuta-musl")),
            ],
        );
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader.clone());

        manager.install(TUTA_REPO).await.unwrap();

        assert_eq!(std::fs::read(tuta_binary(&temp)).unwrap(), b"tuta-musl");
        assert_eq!(locked_plugins(&temp)[0].providers[0].target, MUSL);
        let gnu_download = format!("/{TUTA_REPO}/releases/download/v1.0.0/{}", tuta_asset(GNU));
        assert_eq!(downloader.request_count(&gnu_download), 0);
    }

    #[tokio::test]
    async fn digest_mismatch_keeps_the_installed_provider() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_provider(
            &downloader,
            TUTA_REPO,
            COMMIT_V1,
            "v1.0.0",
            PROVIDER_MANIFEST,
            &[(GNU, &tuta_archive(GNU, b"tuta-v1"))],
        );
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader.clone());
        manager.install(TUTA_REPO).await.unwrap();

        serve_provider(
            &downloader,
            TUTA_REPO,
            COMMIT_V2,
            "v2.0.0",
            PROVIDER_MANIFEST,
            &[(GNU, &tuta_archive(GNU, b"tuta-v2"))],
        );
        downloader.set(
            &format!("/{TUTA_REPO}/releases/download/v2.0.0/{}", tuta_asset(GNU)),
            200,
            tuta_archive(GNU, b"tampered"),
        );

        let error = manager.install(TUTA_REPO).await.unwrap_err();
        assert_eq!(error.kind, PluginInstallErrorKind::InvalidPackage);
        assert!(error.to_string().contains("sha256 digest"), "{error}");
        assert_eq!(std::fs::read(tuta_binary(&temp)).unwrap(), b"tuta-v1");
        assert_eq!(locked_plugins(&temp)[0].tag.as_deref(), Some("v1.0.0"));
    }

    #[tokio::test]
    async fn rejects_release_assets_without_a_digest() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_provider(
            &downloader,
            TUTA_REPO,
            COMMIT_V1,
            "v1.0.0",
            PROVIDER_MANIFEST,
            &[(GNU, &tuta_archive(GNU, b"tuta"))],
        );
        downloader.set(
            &format!("/repos/{TUTA_REPO}/releases/latest"),
            200,
            format!(
                r#"{{"tag_name":"v1.0.0","assets":[{{"name":"{}","digest":null}}]}}"#,
                tuta_asset(GNU)
            ),
        );
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);

        let error = manager.inspect(TUTA_REPO).await.unwrap_err();
        assert!(
            error.to_string().contains("has no sha256 digest"),
            "{error}"
        );
        assert!(manager.install(TUTA_REPO).await.is_err());
        assert!(!tuta_package(&temp).exists());
    }

    #[tokio::test]
    async fn providers_without_an_asset_for_this_platform_are_skipped() {
        let darwin = "aarch64-apple-darwin";
        let archive = tuta_archive(darwin, b"tuta-darwin");
        let temp = tempfile::tempdir().unwrap();

        let downloader = Arc::new(FixtureDownloader::new());
        serve_provider(
            &downloader,
            TUTA_REPO,
            COMMIT_V1,
            "v1.0.0",
            PROVIDER_MANIFEST,
            &[(darwin, &archive)],
        );
        let manager_without_asset = manager(&temp, downloader);
        let inspection = manager_without_asset.inspect(TUTA_REPO).await.unwrap();
        assert_eq!(inspection.providers[0].asset, None);
        let error = manager_without_asset.install(TUTA_REPO).await.unwrap_err();
        assert_eq!(error.kind, PluginInstallErrorKind::Incompatible);
        assert_eq!(
            error.to_string(),
            format!("Tuta has no release asset for this platform ({MUSL}, {GNU})")
        );
        assert!(!tuta_package(&temp).exists());

        // A mixed package still installs its themes.
        let downloader = Arc::new(FixtureDownloader::new());
        let mixed = format!("{PROVIDER_MANIFEST}{MIXED_THEME}");
        serve_provider(
            &downloader,
            TUTA_REPO,
            COMMIT_V1,
            "v1.0.0",
            &mixed,
            &[(darwin, &archive)],
        );
        manager(&temp, downloader).install(TUTA_REPO).await.unwrap();
        assert!(tuta_package(&temp).join("themes/dark.css").is_file());
        assert!(!tuta_package(&temp).join("bin").exists());
        assert!(locked_plugins(&temp)[0].providers.is_empty());
    }

    #[tokio::test]
    async fn rejects_unsafe_or_incomplete_provider_archives() {
        let binary = "caldir-provider-tuta";
        let nested = format!("dir/{binary}");
        let too_deep = format!("a/b/{binary}");
        let parent = format!("../{binary}");
        let absolute = format!("/{binary}");
        let regular = tar::EntryType::Regular;
        let cases: Vec<(Vec<u8>, &str)> = vec![
            (
                archive(&[(binary, tar::EntryType::Symlink, b"")]),
                "not a regular file",
            ),
            (
                archive(&[(&nested, tar::EntryType::Link, b"")]),
                "not a regular file",
            ),
            (archive(&[(&parent, regular, b"x")]), "not a relative path"),
            (
                archive(&[(&absolute, regular, b"x")]),
                "not a relative path",
            ),
            (
                archive(&[(binary, regular, b"x"), ("../evil", regular, b"x")]),
                "not a relative path",
            ),
            (archive(&[(&too_deep, regular, b"x")]), "does not contain"),
            (archive(&[("README.md", regular, b"x")]), "does not contain"),
            (
                archive(&[(binary, regular, b"x"), (&nested, regular, b"x")]),
                "more than once",
            ),
            (
                b"not a gzip archive".to_vec(),
                "could not read provider archive",
            ),
        ];
        for (bytes, expected) in cases {
            let downloader = Arc::new(FixtureDownloader::new());
            serve_provider(
                &downloader,
                TUTA_REPO,
                COMMIT_V1,
                "v1.0.0",
                PROVIDER_MANIFEST,
                &[(GNU, &bytes)],
            );
            let temp = tempfile::tempdir().unwrap();

            let error = manager(&temp, downloader)
                .install(TUTA_REPO)
                .await
                .unwrap_err();

            assert_eq!(error.kind, PluginInstallErrorKind::InvalidPackage);
            assert!(error.to_string().contains(expected), "{expected}: {error}");
            assert!(!tuta_package(&temp).exists());
            assert!(!temp.path().join("data/caldir-provider-tuta").exists());
        }
    }

    #[tokio::test]
    async fn installs_a_provider_binary_at_the_archive_root() {
        let downloader = Arc::new(FixtureDownloader::new());
        let bytes = archive(&[("./caldir-provider-tuta", tar::EntryType::Regular, b"root")]);
        serve_provider(
            &downloader,
            TUTA_REPO,
            COMMIT_V1,
            "v1.0.0",
            PROVIDER_MANIFEST,
            &[(GNU, &bytes)],
        );
        let temp = tempfile::tempdir().unwrap();

        manager(&temp, downloader).install(TUTA_REPO).await.unwrap();

        assert_eq!(std::fs::read(tuta_binary(&temp)).unwrap(), b"root");
    }

    #[tokio::test]
    async fn rejects_provider_icons_that_are_not_svg() {
        for icon in ["<html><body>Tuta</body></html>", "Tuta", "<svg><g></svg>"] {
            let downloader = Arc::new(FixtureDownloader::new());
            serve_provider(
                &downloader,
                TUTA_REPO,
                COMMIT_V1,
                "v1.0.0",
                PROVIDER_MANIFEST,
                &[(GNU, &tuta_archive(GNU, b"tuta"))],
            );
            downloader.set(
                &format!("/{TUTA_REPO}/{COMMIT_V1}/icons/tuta.svg"),
                200,
                icon,
            );
            let temp = tempfile::tempdir().unwrap();

            let error = manager(&temp, downloader)
                .install(TUTA_REPO)
                .await
                .unwrap_err();

            assert!(
                error.to_string().contains("is not an SVG image"),
                "{icon}: {error}"
            );
        }
    }

    #[tokio::test]
    async fn provider_plugins_require_a_release() {
        let downloader = Arc::new(FixtureDownloader::new());
        downloader.set(
            &format!("/repos/{TUTA_REPO}/commits?per_page=1"),
            200,
            format!(r#"[{{"sha":"{COMMIT_V1}"}}]"#),
        );
        downloader.set(
            &format!("/{TUTA_REPO}/{COMMIT_V1}/rencal-plugin.toml"),
            200,
            PROVIDER_MANIFEST,
        );
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);

        for error in [
            manager.inspect(TUTA_REPO).await.unwrap_err(),
            manager.install(TUTA_REPO).await.unwrap_err(),
        ] {
            assert_eq!(error.kind, PluginInstallErrorKind::MissingRelease);
            assert_eq!(
                error.to_string(),
                "provider plugins must be installed from a release"
            );
        }
    }

    #[tokio::test]
    async fn restores_provider_binaries_from_the_locked_asset_and_digest() {
        let downloader = Arc::new(FixtureDownloader::new());
        let archive_v1 = tuta_archive(GNU, b"tuta-v1");
        serve_provider(
            &downloader,
            TUTA_REPO,
            COMMIT_V1,
            "v1.0.0",
            PROVIDER_MANIFEST,
            &[(GNU, &archive_v1)],
        );
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader.clone());
        manager.install(TUTA_REPO).await.unwrap();
        let latest = format!("/repos/{TUTA_REPO}/releases/latest");
        assert_eq!(downloader.request_count(&latest), 1);

        // A newer release must not leak into a restore of the locked one.
        serve_provider(
            &downloader,
            TUTA_REPO,
            COMMIT_V2,
            "v2.0.0",
            PROVIDER_MANIFEST,
            &[(MUSL, &tuta_archive(MUSL, b"tuta-v2"))],
        );
        std::fs::remove_dir_all(tuta_package(&temp)).unwrap();
        assert!(manager.reconcile().await.is_empty());
        assert_eq!(std::fs::read(tuta_binary(&temp)).unwrap(), b"tuta-v1");
        assert_eq!(downloader.request_count(&latest), 1);
        assert_eq!(
            locked_plugins(&temp)[0].providers[0].sha256,
            sha256_hex(&archive_v1)
        );

        std::fs::remove_dir_all(tuta_package(&temp)).unwrap();
        downloader.set(
            &format!("/{TUTA_REPO}/releases/download/v1.0.0/{}", tuta_asset(GNU)),
            200,
            tuta_archive(GNU, b"replaced"),
        );
        let errors = manager.reconcile().await;
        assert_eq!(errors.len(), 1);
        assert!(errors[0].message.contains("sha256 digest"), "{errors:?}");
        assert!(!tuta_package(&temp).exists());
        assert_eq!(locked_plugins(&temp)[0].tag.as_deref(), Some("v1.0.0"));
    }

    #[tokio::test]
    async fn refuses_a_provider_slug_installed_by_another_plugin() {
        let downloader = Arc::new(FixtureDownloader::new());
        let archive = tuta_archive(GNU, b"tuta");
        serve_provider(
            &downloader,
            TUTA_REPO,
            COMMIT_V1,
            "v1.0.0",
            PROVIDER_MANIFEST,
            &[(GNU, &archive)],
        );
        let mirror = "Bob/tuta-mirror";
        serve_provider(
            &downloader,
            mirror,
            COMMIT_V2,
            "v1.0.0",
            &PROVIDER_MANIFEST.replacen("alice.tuta", "bob.tuta-mirror", 1),
            &[(GNU, &archive)],
        );
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        manager.install(TUTA_REPO).await.unwrap();

        let error = manager.install(mirror).await.unwrap_err();

        assert_eq!(error.kind, PluginInstallErrorKind::InvalidInput);
        assert_eq!(
            error.to_string(),
            "the \"tuta\" provider is already installed by Tuta (alice.tuta); uninstall it first"
        );
        assert!(!temp.path().join("data/plugins/bob.tuta-mirror").exists());
        // Updating the plugin that owns the slug is not a conflict.
        manager.install(TUTA_REPO).await.unwrap();
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
