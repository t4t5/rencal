//! Watches `~/.config/rencal/keys.toml` and emits `keys-changed` with the
//! reloaded bindings.

use std::ffi::OsStr;
use std::path::Path;

use notify::RecursiveMode;
use rencal_config::RencalConfig;
use tauri::AppHandle;

use crate::events::AppEvent;
use crate::fs_watch::{file_watch_dirs, is_any_change, watch_debounced};
use crate::keys::{self, KEYS_FILE};

fn is_keys_file(path: &Path) -> bool {
    path.file_name() == Some(OsStr::new(KEYS_FILE))
}

fn is_keys_change(event: &notify::Event) -> bool {
    is_any_change(event) && event.paths.iter().any(|path| is_keys_file(path))
}

pub async fn run_watcher(app: AppHandle) {
    let Ok(config_dir) = RencalConfig::config_dir() else {
        return;
    };
    if let Err(error) = std::fs::create_dir_all(&config_dir) {
        log::warn!("keys watcher: cannot create {config_dir:?}: {error}");
        return;
    }

    let directories = file_watch_dirs(&config_dir.join(KEYS_FILE));
    let mut watch = match watch_debounced(&directories, RecursiveMode::NonRecursive, is_keys_change)
    {
        Ok(watch) => watch,
        Err(error) => {
            log::warn!("keys watcher: failed to watch {directories:?}: {error}");
            return;
        }
    };

    while watch.changed().await.is_some() {
        let _ = AppEvent::KeysChanged(keys::load()).emit(&app);
    }
}

#[cfg(test)]
mod tests {
    use super::is_keys_file;
    use std::path::Path;

    #[test]
    fn matches_keys_toml_only() {
        assert!(is_keys_file(Path::new("/home/u/.config/rencal/keys.toml")));
        assert!(!is_keys_file(Path::new(
            "/home/u/.config/rencal/config.toml"
        )));
        assert!(!is_keys_file(Path::new("keys.toml.bak")));
    }
}
