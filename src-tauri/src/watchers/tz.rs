//! Watches `/etc/localtime` and emits `system-tz-changed` with the new IANA
//! timezone name when the system timezone changes, so the frontend can re-render
//! event times in the current zone. The webview's own `Intl` timezone is fixed
//! at process start, so the frontend cannot detect this itself.

use crate::events::AppEvent;

use std::ffi::OsStr;
use std::path::Path;

use notify::RecursiveMode;
use tauri::AppHandle;

use crate::fs_watch::{is_any_change, watch_debounced};

fn is_localtime(path: &Path) -> bool {
    path.file_name() == Some(OsStr::new("localtime"))
}

fn is_localtime_change(event: &notify::Event) -> bool {
    is_any_change(event) && event.paths.iter().any(|path| is_localtime(path))
}

pub async fn run_watcher(app: AppHandle) {
    // `timedatectl set-timezone` re-points the /etc/localtime symlink. Watch the
    // parent directory: watching the symlink itself would follow it to the zoneinfo
    // file, which never changes.
    let etc = Path::new("/etc");
    if !etc.exists() {
        return;
    }

    let mut last_tz = iana_time_zone::get_timezone().ok();

    let mut watch = match watch_debounced(&[etc], RecursiveMode::NonRecursive, is_localtime_change)
    {
        Ok(watch) => watch,
        Err(err) => {
            log::warn!("timezone watcher: failed to watch /etc: {err}");
            return;
        }
    };

    while watch.changed().await.is_some() {
        let Ok(tz) = iana_time_zone::get_timezone() else {
            continue;
        };
        if last_tz.as_deref() != Some(tz.as_str()) {
            log::info!("System timezone changed to {tz}");
            last_tz = Some(tz.clone());
            let _ = AppEvent::SystemTzChanged(tz).emit(&app);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::is_localtime;
    use std::path::Path;

    #[test]
    fn matches_localtime_only() {
        assert!(is_localtime(Path::new("/etc/localtime")));
        assert!(!is_localtime(Path::new("/etc/localtime.bak")));
        assert!(!is_localtime(Path::new("/etc/hosts")));
        assert!(!is_localtime(Path::new("/etc")));
    }
}
