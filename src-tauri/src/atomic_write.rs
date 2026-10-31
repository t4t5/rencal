//! Replace a file atomically: write a temporary file beside it, then rename it
//! over the original, so readers (and watchers) never see half a file.

use std::io::Write;
use std::path::Path;

/// Writes `contents` to `path`. With `follow_symlink`, a symlink at `path`
/// (a dotfiles checkout) stays in place and its target is replaced instead.
/// `new_file_mode` applies when the file doesn't exist yet; an existing file
/// keeps its permissions. `label` names the file in errors.
pub fn write_atomic(
    path: &Path,
    contents: &[u8],
    label: &str,
    follow_symlink: bool,
    new_file_mode: u32,
) -> Result<(), String> {
    #[cfg(not(unix))]
    let _ = new_file_mode;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("could not create {}: {error}", parent.display()))?;
    }
    // Keep dotfile-manager symlinks intact while still replacing the actual
    // file atomically.
    let destination = match std::fs::symlink_metadata(path) {
        Ok(metadata) if follow_symlink && metadata.file_type().is_symlink() => {
            std::fs::canonicalize(path).map_err(|error| {
                format!(
                    "could not resolve {label} symlink {}: {error}",
                    path.display()
                )
            })?
        }
        _ => path.to_path_buf(),
    };
    let parent = destination
        .parent()
        .ok_or_else(|| format!("{} has no parent directory", destination.display()))?;

    #[cfg(unix)]
    let destination_mode = match std::fs::metadata(&destination) {
        Ok(metadata) => {
            use std::os::unix::fs::PermissionsExt;
            metadata.permissions().mode()
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => new_file_mode,
        Err(error) => {
            return Err(format!(
                "could not read permissions for {}: {error}",
                destination.display()
            ));
        }
    };

    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|error| {
        format!(
            "could not create temporary {label} beside {}: {error}",
            path.display()
        )
    })?;
    temporary
        .write_all(contents)
        .map_err(|error| format!("could not write temporary {label}: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = std::fs::Permissions::from_mode(destination_mode);
        temporary
            .as_file()
            .set_permissions(permissions)
            .map_err(|error| format!("could not set temporary {label} permissions: {error}"))?;
    }
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| format!("could not sync temporary {label}: {error}"))?;
    temporary.persist(&destination).map_err(|error| {
        format!(
            "could not replace {}: {}",
            destination.display(),
            error.error
        )
    })?;
    Ok(())
}
