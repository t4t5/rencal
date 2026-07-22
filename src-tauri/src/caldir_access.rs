use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};

#[cfg(target_os = "linux")]
use std::ffi::OsString;

use caldir_core::Caldir;
use serde::{Deserialize, Serialize};

const GRANT_FILE_NAME: &str = "flatpak-data-dir.json";
#[cfg(target_os = "linux")]
const HOST_PATH_XATTR: &str = "user.document-portal.host-path";

static ACTIVE_GRANT: OnceLock<Mutex<Option<DataDirGrant>>> = OnceLock::new();

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
struct DataDirGrant {
    host_path: PathBuf,
    portal_path: PathBuf,
}

pub fn is_flatpak() -> bool {
    std::env::var_os("FLATPAK_ID").is_some_and(|id| !id.is_empty())
}

/// Load caldir using the canonical configured directory on native builds and
/// the validated Documents portal alias inside Flatpak.
pub fn load_caldir() -> Result<Caldir, String> {
    let caldir = load_canonical_caldir()?;

    if !is_flatpak() {
        return Ok(with_bundled_providers(caldir));
    }

    let host_path = normalize_path(&caldir.config().data_dir())?;
    let portal_path = resolve_portal_path(&host_path)?;

    Ok(with_bundled_providers(
        caldir.with_data_dir_override(portal_path),
    ))
}

/// Load config and providers without resolving Flatpak data access. Only use
/// this for authorization/status work; operational callers must use
/// [`load_caldir`].
pub fn load_canonical_caldir() -> Result<Caldir, String> {
    Caldir::load().map_err(|error| error.to_string())
}

pub fn configured_host_path() -> Result<PathBuf, String> {
    let caldir = load_canonical_caldir()?;
    normalize_path(&caldir.config().data_dir())
}

pub fn has_valid_access() -> Result<bool, String> {
    if !is_flatpak() {
        return Ok(true);
    }

    let host_path = configured_host_path()?;
    Ok(resolve_portal_path(&host_path).is_ok())
}

/// Register a portal selection for the directory already in caldir's shared
/// config. The recovered host path must match exactly.
pub fn authorize_configured_dir(portal_path: impl AsRef<Path>) -> Result<(), String> {
    let configured_path = configured_host_path()?;
    let grant = validate_portal_grant(portal_path.as_ref())?;

    if grant.host_path != configured_path {
        return Err(format!(
            "That selection grants access to {}. Please select {} instead.",
            grant.host_path.display(),
            configured_path.display()
        ));
    }

    save_grant(&grant)?;
    set_active_grant(Some(grant));
    Ok(())
}

/// Validate a newly selected portal directory, store its canonical host path
/// in shared caldir config, and retain its portal alias as private app state.
pub fn set_calendar_dir_from_portal(portal_path: impl AsRef<Path>) -> Result<PathBuf, String> {
    let grant = validate_portal_grant(portal_path.as_ref())?;
    let mut caldir = load_canonical_caldir()?;
    let mut config = caldir.config().clone();
    config.set_data_dir(grant.host_path.clone());
    caldir
        .save_config(config)
        .map_err(|error| error.to_string())?;

    save_grant(&grant)?;
    set_active_grant(Some(grant.clone()));
    Ok(grant.host_path)
}

fn with_bundled_providers(caldir: Caldir) -> Caldir {
    match crate::bundled_providers_dir() {
        Some(dir) => caldir.with_bundled_providers(dir),
        None => caldir,
    }
}

fn resolve_portal_path(configured_host_path: &Path) -> Result<PathBuf, String> {
    if let Some(grant) = active_grant()
        && grant.host_path == configured_host_path
        && fs::read_dir(&grant.portal_path).is_ok()
    {
        return Ok(grant.portal_path);
    }

    set_active_grant(None);

    let grant = load_grant().map_err(|error| {
        log::warn!("Flatpak data directory grant is unavailable: {error}");
        authorization_required(configured_host_path)
    })?;

    if grant.host_path != configured_host_path {
        return Err(authorization_required(configured_host_path));
    }

    let validated = validate_portal_grant(&grant.portal_path).map_err(|error| {
        log::warn!("Flatpak data directory grant is stale or revoked: {error}");
        authorization_required(configured_host_path)
    })?;

    if validated.host_path != configured_host_path {
        return Err(authorization_required(configured_host_path));
    }

    set_active_grant(Some(validated.clone()));
    Ok(validated.portal_path)
}

fn authorization_required(path: &Path) -> String {
    format!(
        "Authorization is required to access the configured calendar directory: {}",
        path.display()
    )
}

fn validate_portal_grant(portal_path: &Path) -> Result<DataDirGrant, String> {
    let portal_path = normalize_path(portal_path)?;
    if !portal_path.is_dir() {
        return Err(format!(
            "The selected portal directory is not accessible: {}",
            portal_path.display()
        ));
    }

    let host_path = normalize_path(&recover_host_path(&portal_path)?)?;
    probe_directory_access(&portal_path)?;

    Ok(DataDirGrant {
        host_path,
        portal_path,
    })
}

#[cfg(target_os = "linux")]
fn recover_host_path(portal_path: &Path) -> Result<PathBuf, String> {
    use std::os::unix::ffi::OsStringExt;

    let bytes = xattr::get(portal_path, HOST_PATH_XATTR)
        .map_err(|error| format!("Could not inspect the portal grant: {error}"))?
        .ok_or_else(|| {
            "The selected directory was not returned by the Documents portal.".to_string()
        })?;

    if bytes.is_empty() {
        return Err("The Documents portal returned an empty host path.".to_string());
    }

    Ok(PathBuf::from(OsString::from_vec(bytes)))
}

#[cfg(not(target_os = "linux"))]
fn recover_host_path(_portal_path: &Path) -> Result<PathBuf, String> {
    Err("Documents portal access is only supported on Linux.".to_string())
}

fn probe_directory_access(path: &Path) -> Result<(), String> {
    fs::read_dir(path)
        .map_err(|error| format!("Could not enumerate the selected directory: {error}"))?;

    let token = format!("{}-{}", std::process::id(), unique_token());
    let source = path.join(format!(".rencal-access-probe-{token}.tmp"));
    let destination = path.join(format!(".rencal-access-probe-{token}"));

    let operation = (|| -> std::io::Result<()> {
        fs::write(&source, b"rencal")?;
        OpenOptions::new()
            .append(true)
            .open(&source)?
            .write_all(b"-portal-probe")?;
        fs::rename(&source, &destination)?;
        fs::remove_file(&destination)?;
        Ok(())
    })();

    let mut cleanup_errors = Vec::new();
    for probe in [&source, &destination] {
        match fs::remove_file(probe) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => cleanup_errors.push(format!("{}: {error}", probe.display())),
        }
    }

    if let Err(error) = operation {
        let cleanup = if cleanup_errors.is_empty() {
            String::new()
        } else {
            format!(" Probe cleanup also failed: {}", cleanup_errors.join(", "))
        };
        return Err(format!(
            "The selected directory is not writable through the portal: {error}.{cleanup}"
        ));
    }

    if !cleanup_errors.is_empty() {
        return Err(format!(
            "The portal access probe could not be cleaned up: {}",
            cleanup_errors.join(", ")
        ));
    }

    Ok(())
}

fn grant_path() -> Result<PathBuf, String> {
    dirs::data_dir()
        .map(|path| path.join("rencal").join(GRANT_FILE_NAME))
        .ok_or_else(|| "Could not determine renCal's private data directory.".to_string())
}

fn load_grant() -> Result<DataDirGrant, String> {
    let path = grant_path()?;
    let bytes =
        fs::read(&path).map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| format!("Could not parse {}: {error}", path.display()))
}

fn save_grant(grant: &DataDirGrant) -> Result<(), String> {
    let path = grant_path()?;
    let parent = path
        .parent()
        .ok_or_else(|| "The grant file has no parent directory.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;

    let temp_path = parent.join(format!(".{GRANT_FILE_NAME}.{}.tmp", unique_token()));
    let bytes = serde_json::to_vec_pretty(grant)
        .map_err(|error| format!("Could not serialize the portal grant: {error}"))?;

    let result = (|| -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        fs::rename(&temp_path, &path)?;
        Ok(())
    })();

    if let Err(error) = result {
        let _ = fs::remove_file(&temp_path);
        return Err(format!("Could not save {}: {error}", path.display()));
    }

    Ok(())
}

fn active_grant() -> Option<DataDirGrant> {
    ACTIVE_GRANT
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

fn set_active_grant(grant: Option<DataDirGrant>) {
    *ACTIVE_GRANT
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = grant;
}

fn normalize_path(path: &Path) -> Result<PathBuf, String> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|error| format!("Could not resolve {}: {error}", path.display()))?
            .join(path)
    };

    let mut normalized = PathBuf::new();
    for component in absolute.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }

    Ok(normalized)
}

fn unique_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_path_resolves_relative_components() {
        assert_eq!(
            normalize_path(Path::new("/home/alice/./calendars/../caldir")).unwrap(),
            PathBuf::from("/home/alice/caldir")
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn validates_portal_host_path_and_read_write_access() {
        let temp = tempfile::TempDir::new().unwrap();
        let portal_path = temp.path().join("calendar with spaces");
        fs::create_dir(&portal_path).unwrap();
        xattr::set(&portal_path, HOST_PATH_XATTR, b"/home/alice/calendar")
            .expect("test filesystem must support user xattrs");

        let grant = validate_portal_grant(&portal_path).unwrap();

        assert_eq!(grant.host_path, PathBuf::from("/home/alice/calendar"));
        assert_eq!(grant.portal_path, portal_path);
        assert!(fs::read_dir(&grant.portal_path).unwrap().next().is_none());
    }
}
