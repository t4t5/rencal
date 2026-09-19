//! GitHub-backed installation for data-only theme packages.
//!
//! Downloads are bounded and written to a staging directory. Package swaps and
//! `plugins.toml` updates are serialized so a failed install or update can put
//! the previous directory back before returning.

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

use super::{
    Appearance, MANIFEST_FILE, PluginEntry, PluginManifest, PluginsFile, load_plugins_file,
    plugins_dir, plugins_file_path, running_app_version, save_plugins_file, validate_manifest,
    validate_manifest_owner, validate_release_tag,
};

const RELEASE_RESPONSE_LIMIT: usize = 64 * 1024;
const MANIFEST_LIMIT: usize = 128 * 1024;
const CSS_FILE_LIMIT: usize = 1024 * 1024;
const PACKAGE_LIMIT: usize = 4 * 1024 * 1024;

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
pub struct PluginInspection {
    pub id: String,
    pub name: String,
    pub description: String,
    pub repo: String,
    pub version: String,
    pub min_rencal_version: String,
    pub compatible: bool,
    pub themes: Vec<PluginThemeInspection>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PluginRestoreError {
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
    packages_dir: PathBuf,
    mutations: Mutex<()>,
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
    tag: String,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
}

enum MissingResponse {
    Release,
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
        Self::new(
            declarations_path,
            packages_dir,
            Url::parse("https://api.github.com/").expect("valid GitHub API URL"),
            Url::parse("https://raw.githubusercontent.com/").expect("valid GitHub raw URL"),
        )
    }

    fn new(
        declarations_path: PathBuf,
        packages_dir: PathBuf,
        api_base: Url,
        raw_base: Url,
    ) -> Result<Self, PluginInstallError> {
        // reqwest intentionally leaves provider choice to the application.
        // Installing ring is idempotent; another Tauri plugin may have done it.
        let _ = rustls::crypto::ring::default_provider().install_default();
        let client = reqwest::Client::builder()
            .user_agent(format!("renCal/{}", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|error| {
                PluginInstallError::new(
                    PluginInstallErrorKind::Network,
                    format!("could not create GitHub client: {error}"),
                )
            })?;
        Ok(Self::with_downloader(
            declarations_path,
            packages_dir,
            api_base,
            raw_base,
            Arc::new(ReqwestDownloader { client }),
        ))
    }

    fn with_downloader(
        declarations_path: PathBuf,
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
                packages_dir,
                mutations: Mutex::new(()),
            }),
        }
    }

    /// Resolve and validate the latest stable GitHub release without writing it.
    pub async fn inspect(&self, repo: &str) -> Result<PluginInspection, PluginInstallError> {
        let repository = Repository::parse(repo)?;
        Ok(self.resolve_latest(&repository).await?.inspection)
    }

    /// Install the latest stable release, or replace the installed package with it.
    pub async fn install(&self, repo: &str) -> Result<PluginInspection, PluginInstallError> {
        let repository = Repository::parse(repo)?;
        let _guard = self.inner.mutations.lock().await;
        let declarations = self.load_declarations()?;
        let package = self.resolve_latest(&repository).await?;
        self.require_compatible(&package.inspection)?;
        self.install_resolved(&repository, package, declarations, None)
            .await
    }

    /// Remove both the declaration and package directory. A missing directory
    /// is tolerated so a broken declaration can still be cleaned up.
    pub async fn uninstall(&self, id: &str) -> Result<(), PluginInstallError> {
        let _guard = self.inner.mutations.lock().await;
        let mut declarations = self.load_declarations()?;
        let Some(index) = declarations.plugins.iter().position(|entry| entry.id == id) else {
            return Err(PluginInstallError::new(
                PluginInstallErrorKind::InvalidInput,
                format!("plugin {id:?} is not installed"),
            ));
        };

        let target = self.inner.packages_dir.join(id);
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
        let moved = if target.exists() {
            std::fs::rename(&target, &backup_package).map_err(|error| {
                PluginInstallError::io(format!("could not remove plugin {id:?}"), error)
            })?;
            true
        } else {
            false
        };

        declarations.plugins.remove(index);
        if let Err(error) = save_plugins_file(&self.inner.declarations_path, &declarations) {
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

    /// Restore declarations whose package directory is absent. Versioned
    /// entries fetch that exact release; an omitted version resolves latest and
    /// is written back after a successful install.
    pub async fn restore_missing(&self) -> Vec<PluginRestoreError> {
        let declarations = match self.load_declarations() {
            Ok(declarations) => declarations,
            Err(error) => {
                return vec![PluginRestoreError {
                    package: self.inner.declarations_path.display().to_string(),
                    message: error.to_string(),
                }];
            }
        };
        let missing: Vec<_> = declarations
            .plugins
            .into_iter()
            .filter(|entry| {
                entry.version.is_none() || !self.inner.packages_dir.join(&entry.id).is_dir()
            })
            .collect();

        let mut errors = Vec::new();
        for entry in missing {
            if let Err(error) = self.restore_entry(&entry).await {
                errors.push(PluginRestoreError {
                    package: entry.id,
                    message: error.to_string(),
                });
            }
        }
        errors
    }

    async fn restore_entry(&self, entry: &PluginEntry) -> Result<(), PluginInstallError> {
        let repository = Repository::parse(&entry.repo)?;
        let _guard = self.inner.mutations.lock().await;
        let declarations = self.load_declarations()?;
        let package = match &entry.version {
            Some(version) => self.resolve_version(&repository, version).await?,
            None => self.resolve_latest(&repository).await?,
        };
        if package.manifest.id != entry.id {
            return Err(PluginInstallError::invalid_package(format!(
                "manifest id {:?} does not match declared plugin id {:?}",
                package.manifest.id, entry.id
            )));
        }
        self.require_compatible(&package.inspection)?;
        self.install_resolved(&repository, package, declarations, Some(&entry.id))
            .await?;
        Ok(())
    }

    fn load_declarations(&self) -> Result<PluginsFile, PluginInstallError> {
        load_plugins_file(&self.inner.declarations_path).map_err(|error| {
            PluginInstallError::new(PluginInstallErrorKind::Configuration, error.to_string())
        })
    }

    async fn resolve_latest(
        &self,
        repository: &Repository,
    ) -> Result<ResolvedPackage, PluginInstallError> {
        let url = self.api_url(repository, &["releases", "latest"]);
        let bytes = self
            .fetch_bounded(url, RELEASE_RESPONSE_LIMIT, MissingResponse::Release)
            .await?;
        let release: GithubRelease = serde_json::from_slice(&bytes).map_err(|error| {
            PluginInstallError::new(
                PluginInstallErrorKind::Network,
                format!("GitHub returned an invalid release response: {error}"),
            )
        })?;
        self.resolve_tag(repository, release.tag_name).await
    }

    async fn resolve_version(
        &self,
        repository: &Repository,
        version: &str,
    ) -> Result<ResolvedPackage, PluginInstallError> {
        for tag in [format!("v{version}"), version.to_string()] {
            let url = self.api_url(repository, &["releases", "tags", &tag]);
            match self
                .fetch_optional_release(url, RELEASE_RESPONSE_LIMIT)
                .await?
            {
                Some(bytes) => {
                    let release: GithubRelease =
                        serde_json::from_slice(&bytes).map_err(|error| {
                            PluginInstallError::new(
                                PluginInstallErrorKind::Network,
                                format!("GitHub returned an invalid release response: {error}"),
                            )
                        })?;
                    return self.resolve_tag(repository, release.tag_name).await;
                }
                None => continue,
            }
        }
        Err(PluginInstallError::new(
            PluginInstallErrorKind::MissingRelease,
            format!(
                "repository {:?} has no release for version {version}",
                repository.display
            ),
        ))
    }

    async fn resolve_tag(
        &self,
        repository: &Repository,
        tag: String,
    ) -> Result<ResolvedPackage, PluginInstallError> {
        let manifest_url = self.raw_url(repository, &tag, MANIFEST_FILE);
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
        validate_release_tag(&manifest, &tag)
            .map_err(|error| PluginInstallError::invalid_package(error.to_string()))?;

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
        };
        Ok(ResolvedPackage {
            inspection,
            manifest,
            manifest_text,
            tag,
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
        expected_id: Option<&str>,
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

        let entry = PluginEntry {
            id: package.manifest.id.clone(),
            repo: repository.display.clone(),
            version: Some(package.manifest.version.clone()),
        };
        if let Some(existing) = declarations
            .plugins
            .iter_mut()
            .find(|existing| existing.id == entry.id)
        {
            *existing = entry;
        } else {
            declarations.plugins.push(entry);
        }
        if let Err(error) = save_plugins_file(&self.inner.declarations_path, &declarations) {
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
        for theme in &package.manifest.contributes.themes {
            let bytes = self
                .fetch_bounded(
                    self.raw_url(repository, &package.tag, &theme.css),
                    CSS_FILE_LIMIT,
                    MissingResponse::PackageFile(theme.css.clone()),
                )
                .await?;
            package_size += bytes.len();
            if package_size > PACKAGE_LIMIT {
                return Err(PluginInstallError::invalid_package(format!(
                    "plugin package exceeds the {} byte download limit",
                    PACKAGE_LIMIT
                )));
            }
            let path = directory.join(&theme.css);
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

    fn raw_url(&self, repository: &Repository, tag: &str, path: &str) -> Url {
        let mut url = self.inner.raw_base.clone();
        url.path_segments_mut()
            .expect("GitHub raw base can be a path base")
            .extend([&repository.owner, &repository.name, tag])
            .extend(path.split('/'));
        url
    }

    async fn fetch_optional_release(
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
                MissingResponse::PackageFile(path) => PluginInstallError::invalid_package(format!(
                    "release does not contain {path:?}"
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
        let Some((owner, name)) = value.split_once('/') else {
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
            display: value.to_string(),
        })
    }

    fn invalid(value: &str) -> PluginInstallError {
        PluginInstallError::new(
            PluginInstallErrorKind::InvalidInput,
            format!("repository {value:?} must be owner/repo"),
        )
    }
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

fn remove_path(path: &Path) -> std::io::Result<()> {
    if path.is_dir() {
        std::fs::remove_dir_all(path)
    } else if path.exists() {
        std::fs::remove_file(path)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Mutex as StdMutex;

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

    struct FixtureDownloader {
        base: Url,
        responses: Arc<StdMutex<HashMap<String, (u16, Vec<u8>)>>>,
    }

    impl FixtureDownloader {
        fn new() -> Self {
            Self {
                base: Url::parse("https://fixture.invalid/").unwrap(),
                responses: Arc::new(StdMutex::new(HashMap::new())),
            }
        }

        fn set(&self, path: &str, status: u16, body: impl Into<Vec<u8>>) {
            self.responses
                .lock()
                .unwrap()
                .insert(path.into(), (status, body.into()));
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
                let (status, bytes) = self
                    .responses
                    .lock()
                    .unwrap()
                    .get(url.path())
                    .cloned()
                    .unwrap_or((404, Vec::new()));
                if bytes.len() > limit {
                    return Err(PluginInstallError::invalid_package(format!(
                        "download exceeds the {limit} byte limit"
                    )));
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
            "/Alice/rencal-dusk/v1.0.0/rencal-plugin.toml",
            200,
            MANIFEST_V1.as_bytes().to_vec(),
        );
        downloader.set(
            "/Alice/rencal-dusk/v1.0.0/themes/dark.css",
            200,
            b"--background: #111;".to_vec(),
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
        assert_eq!(declarations.plugins[0].version.as_deref(), Some("1.0.0"));

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
            "/Alice/rencal-dusk/v2.0.0/rencal-plugin.toml",
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
        let declarations = load_plugins_file(&temp.path().join("config/plugins.toml")).unwrap();
        assert_eq!(declarations.plugins[0].version.as_deref(), Some("1.0.0"));
    }

    #[tokio::test]
    async fn restores_the_exact_declared_version() {
        let downloader = Arc::new(FixtureDownloader::new());
        serve_v1(&downloader);
        downloader.set(
            "/repos/Alice/rencal-dusk/releases/tags/v1.0.0",
            200,
            br#"{"tag_name":"v1.0.0"}"#.to_vec(),
        );
        let temp = tempfile::tempdir().unwrap();
        let manager = manager(&temp, downloader);
        save_plugins_file(
            &temp.path().join("config/plugins.toml"),
            &PluginsFile {
                plugins: vec![PluginEntry {
                    id: "alice.dusk".into(),
                    repo: "Alice/rencal-dusk".into(),
                    version: Some("1.0.0".into()),
                }],
            },
        )
        .unwrap();

        assert!(manager.restore_missing().await.is_empty());
        assert!(temp.path().join("data/plugins/alice.dusk").is_dir());
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
}
