//! Watches the user-owned plugin declarations and reconciles managed packages.

use std::ffi::OsStr;
use std::path::Path;
use std::sync::Arc;

use notify::RecursiveMode;
use tauri::AppHandle;

use crate::events::AppEvent;
use crate::external_themes;
use crate::external_views;
use crate::fs_watch::{file_watch_dirs, is_any_change, watch_debounced};
use crate::plugins::PluginManager;
use crate::state::AppState;

fn is_plugins_file(path: &Path) -> bool {
    path.file_name() == Some(OsStr::new("plugins.toml"))
}

fn is_plugins_change(event: &notify::Event) -> bool {
    is_any_change(event) && event.paths.iter().any(|path| is_plugins_file(path))
}

async fn reconcile(app: &AppHandle, manager: &PluginManager, state: &AppState) {
    for error in manager.reconcile().await {
        log::error!(
            "could not reconcile plugin {}: {}",
            error.package,
            error.message
        );
    }
    // Installs and uninstalls add, shadow or remove provider binaries.
    state.rescan_providers();
    state.notify_providers_changed();
    // This also refreshes Settings > Plugins, including parse or network
    // errors that did not result in a package-directory change.
    let _ = AppEvent::ExternalThemesChanged(external_themes::scan()).emit(app);
    let _ = AppEvent::ExternalViewsChanged(external_views::scan()).emit(app);
}

pub async fn run_watcher(app: AppHandle, manager: PluginManager, state: Arc<AppState>) {
    let Some(config_dir) = manager.declarations_path().parent() else {
        log::warn!(
            "plugin declarations path has no parent: {:?}",
            manager.declarations_path()
        );
        return;
    };
    if let Err(error) = std::fs::create_dir_all(config_dir) {
        log::warn!("plugin watcher: cannot create {config_dir:?}: {error}");
        reconcile(&app, &manager, &state).await;
        return;
    }

    // Open the watch before the initial reconciliation so an edit made while
    // packages are downloading remains queued for a second pass.
    let directories = file_watch_dirs(manager.declarations_path());
    let mut watch =
        match watch_debounced(&directories, RecursiveMode::NonRecursive, is_plugins_change) {
            Ok(watch) => Some(watch),
            Err(error) => {
                log::warn!("plugin watcher: failed to watch {directories:?}: {error}");
                None
            }
        };

    reconcile(&app, &manager, &state).await;
    while let Some(watch) = &mut watch {
        if watch.changed().await.is_none() {
            return;
        }
        reconcile(&app, &manager, &state).await;
    }
}

#[cfg(test)]
mod tests {
    use super::is_plugins_file;
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
}
