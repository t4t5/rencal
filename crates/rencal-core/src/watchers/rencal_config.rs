//! Watches `~/.config/rencal/config.toml` and reports when it changes.

use std::ffi::OsStr;
use std::path::Path;

use notify::RecursiveMode;
use rencal_config::RencalConfig;

use crate::fs_watch::{is_any_change, watch_debounced};

fn is_config_file(path: &Path) -> bool {
    path.file_name() == Some(OsStr::new("config.toml"))
}

fn is_config_change(event: &notify::Event) -> bool {
    is_any_change(event) && event.paths.iter().any(|path| is_config_file(path))
}

pub async fn run_watcher(on_change: impl Fn() + Send + 'static) {
    let Ok(watch_dir) = RencalConfig::config_dir() else {
        return;
    };

    // The directory may not exist yet on a fresh install (config is written
    // lazily on first save). Create it so the watcher has something to watch.
    if !watch_dir.exists() {
        let _ = std::fs::create_dir_all(&watch_dir);
    }

    let mut watch =
        match watch_debounced(&[&watch_dir], RecursiveMode::NonRecursive, is_config_change) {
            Ok(watch) => watch,
            Err(err) => {
                log::warn!("rencal config watcher: failed to watch {watch_dir:?}: {err}");
                return;
            }
        };

    while watch.changed().await.is_some() {
        on_change();
    }
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
