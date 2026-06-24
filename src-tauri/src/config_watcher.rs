//! Watches `~/.config/rencal/config.toml` and emits `RENCAL_CONFIG_CHANGED` when it changes

use std::ffi::OsStr;
use std::path::Path;
use std::time::Duration;

use notify::{Event, EventKind, RecursiveMode, Watcher};
use rencal_config::RencalConfig;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio::time::sleep;

pub const RENCAL_CONFIG_CHANGED: &str = "rencal-config-changed";

fn is_config_file(path: &Path) -> bool {
    path.file_name() == Some(OsStr::new("config.toml"))
}

pub async fn run_watcher(app: AppHandle) {
    let Ok(watch_dir) = RencalConfig::config_dir() else {
        return;
    };

    // The directory may not exist yet on a fresh install (config is written
    // lazily on first save). Create it so the watcher has something to watch.
    if !watch_dir.exists() {
        let _ = std::fs::create_dir_all(&watch_dir);
    }

    let (tx, mut rx) = mpsc::unbounded_channel::<()>();

    let mut watcher = match notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res
            && matches!(
                event.kind,
                EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
            )
            && event.paths.iter().any(|p| is_config_file(p))
        {
            let _ = tx.send(());
        }
    }) {
        Ok(w) => w,
        Err(e) => {
            log::warn!("Failed to init config watcher: {e}");
            return;
        }
    };

    if let Err(e) = watcher.watch(&watch_dir, RecursiveMode::NonRecursive) {
        log::warn!("Failed to watch {watch_dir:?}: {e}");
        return;
    }

    while rx.recv().await.is_some() {
        // Coalesce editor save bursts (and our own write-back from the in-app switcher).
        sleep(Duration::from_millis(150)).await;
        while rx.try_recv().is_ok() {}

        let _ = app.emit(RENCAL_CONFIG_CHANGED, ());
    }

    drop(watcher);
}

#[cfg(test)]
mod tests {
    use super::is_config_file;
    use std::path::Path;

    #[test]
    fn matches_config_toml_only() {
        assert!(is_config_file(Path::new(
            "/home/u/.config/rencal/config.toml"
        )));
        assert!(!is_config_file(Path::new(
            "/home/u/.config/rencal/themes/foo.css"
        )));
        assert!(!is_config_file(Path::new("/home/u/.config/rencal")));
        assert!(!is_config_file(Path::new("config.toml.bak")));
    }
}
