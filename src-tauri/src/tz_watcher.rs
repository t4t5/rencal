//! Watches `/etc/localtime` and emits `SYSTEM_TZ_CHANGED` with the new IANA
//! timezone name when the system timezone changes, so the frontend can re-render
//! event times in the current zone. The webview's own `Intl` timezone is fixed
//! at process start, so the frontend cannot detect this itself.

use std::ffi::OsStr;
use std::path::Path;
use std::time::Duration;

use notify::{Event, EventKind, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio::time::sleep;

pub const SYSTEM_TZ_CHANGED: &str = "system-tz-changed";

fn is_localtime(path: &Path) -> bool {
    path.file_name() == Some(OsStr::new("localtime"))
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

    let (tx, mut rx) = mpsc::unbounded_channel::<()>();

    let mut watcher = match notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res
            && matches!(
                event.kind,
                EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
            )
            && event.paths.iter().any(|p| is_localtime(p))
        {
            let _ = tx.send(());
        }
    }) {
        Ok(w) => w,
        Err(e) => {
            log::warn!("Failed to init timezone watcher: {e}");
            return;
        }
    };

    if let Err(e) = watcher.watch(etc, RecursiveMode::NonRecursive) {
        log::warn!("Failed to watch /etc for timezone changes: {e}");
        return;
    }

    while rx.recv().await.is_some() {
        // The symlink swap arrives as a burst of remove/create events; coalesce.
        sleep(Duration::from_millis(150)).await;
        while rx.try_recv().is_ok() {}

        let Ok(tz) = iana_time_zone::get_timezone() else {
            continue;
        };
        if last_tz.as_deref() != Some(tz.as_str()) {
            log::info!("System timezone changed to {tz}");
            last_tz = Some(tz.clone());
            let _ = app.emit(SYSTEM_TZ_CHANGED, tz);
        }
    }

    drop(watcher);
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
