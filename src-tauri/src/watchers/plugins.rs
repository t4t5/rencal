//! Watches the user-owned plugin declarations and reconciles managed packages.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use notify::RecursiveMode;
use tauri::AppHandle;

use crate::events::AppEvent;
use crate::external_themes;
use crate::fs_watch::{is_any_change, watch_debounced};
use crate::plugins::PluginManager;

fn is_plugins_file(path: &Path) -> bool {
    path.file_name() == Some(OsStr::new("plugins.toml"))
}

fn is_plugins_change(event: &notify::Event) -> bool {
    is_any_change(event) && event.paths.iter().any(|path| is_plugins_file(path))
}

fn watch_dirs(path: &Path) -> Vec<PathBuf> {
    let mut directories = path
        .parent()
        .map(Path::to_path_buf)
        .into_iter()
        .collect::<Vec<_>>();
    if std::fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink())
        && let Ok(target) = std::fs::read_link(path)
    {
        let target = if target.is_absolute() {
            target
        } else {
            path.parent().unwrap_or_else(|| Path::new("")).join(target)
        };
        if let Some(parent) = target.parent() {
            let parent = std::fs::canonicalize(parent).unwrap_or_else(|_| parent.to_path_buf());
            if parent.is_dir() && !directories.iter().any(|directory| directory == &parent) {
                directories.push(parent);
            }
        }
    }
    directories
}

async fn reconcile(app: &AppHandle, manager: &PluginManager) {
    for error in manager.reconcile().await {
        log::error!(
            "could not reconcile plugin {}: {}",
            error.package,
            error.message
        );
    }
    // This also refreshes Settings > Plugins, including parse or network
    // errors that did not result in a package-directory change.
    let _ = AppEvent::ExternalThemesChanged(external_themes::scan()).emit(app);
}

pub async fn run_watcher(app: AppHandle, manager: PluginManager) {
    let Some(config_dir) = manager.declarations_path().parent() else {
        log::warn!(
            "plugin declarations path has no parent: {:?}",
            manager.declarations_path()
        );
        return;
    };
    if let Err(error) = std::fs::create_dir_all(config_dir) {
        log::warn!("plugin watcher: cannot create {config_dir:?}: {error}");
        reconcile(&app, &manager).await;
        return;
    }

    // Open the watch before the initial reconciliation so an edit made while
    // packages are downloading remains queued for a second pass.
    let directories = watch_dirs(manager.declarations_path());
    let mut watch =
        match watch_debounced(&directories, RecursiveMode::NonRecursive, is_plugins_change) {
            Ok(watch) => Some(watch),
            Err(error) => {
                log::warn!("plugin watcher: failed to watch {directories:?}: {error}");
                None
            }
        };

    reconcile(&app, &manager).await;
    while let Some(watch) = &mut watch {
        if watch.changed().await.is_none() {
            return;
        }
        reconcile(&app, &manager).await;
    }
}

#[cfg(test)]
mod tests {
    use super::{is_plugins_file, watch_dirs};
    use std::path::Path;

    #[test]
    fn matches_plugins_toml_only() {
        assert!(is_plugins_file(Path::new(
            "/home/u/.config/rencal/plugins.toml"
        )));
        assert!(!is_plugins_file(Path::new(
            "/home/u/.config/rencal/config.toml"
        )));
        assert!(!is_plugins_file(Path::new("plugins.toml.bak")));
    }

    #[cfg(unix)]
    #[test]
    fn watches_a_symlinked_declarations_target_too() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().unwrap();
        // macOS resolves /var to /private/var when canonicalizing the symlink
        // target, so construct both expected paths from the resolved root.
        let root = temp.path().canonicalize().unwrap();
        let config = root.join("config");
        let dotfiles = root.join("dotfiles");
        std::fs::create_dir_all(&config).unwrap();
        std::fs::create_dir_all(&dotfiles).unwrap();
        std::fs::write(dotfiles.join("plugins.toml"), "plugins = []\n").unwrap();
        let declarations = config.join("plugins.toml");
        symlink("../dotfiles/plugins.toml", &declarations).unwrap();

        assert_eq!(watch_dirs(&declarations), [config, dotfiles]);
    }
}
