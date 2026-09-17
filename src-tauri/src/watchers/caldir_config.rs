//! Watches caldir's `config.toml` (hand edits, the caldir CLI) and reloads it
//! into `AppState`. Our own writes echo back here too; `AppState` recognises
//! them as unchanged and wakes nobody.

use std::ffi::OsStr;
use std::sync::Arc;

use notify::RecursiveMode;

use crate::fs_watch::{is_any_change, watch_debounced};
use crate::state::AppState;

pub async fn run_watcher(state: Arc<AppState>) {
    let config_path = state.caldir_config_path().to_path_buf();
    let (Some(dir), Some(file_name)) = (config_path.parent(), config_path.file_name()) else {
        return;
    };
    let file_name = file_name.to_os_string();

    // The directory may not exist yet on a fresh install (caldir writes its
    // config lazily). Create it so the watcher has something to watch.
    if !dir.exists() {
        let _ = std::fs::create_dir_all(dir);
    }

    let filter = move |event: &notify::Event| {
        is_any_change(event)
            && event
                .paths
                .iter()
                .any(|path| path.file_name() == Some(OsStr::new(&file_name)))
    };
    let mut watch = match watch_debounced(&[dir], RecursiveMode::NonRecursive, filter) {
        Ok(watch) => watch,
        Err(err) => {
            log::warn!("caldir config watcher: failed to watch {dir:?}: {err}");
            return;
        }
    };

    while watch.changed().await.is_some() {
        match state.reload_caldir_config() {
            Ok(()) => log::debug!("caldir config: reloaded {config_path:?}"),
            Err(err) => log::warn!("caldir config: {err}; keeping the previous config"),
        }
    }
}
