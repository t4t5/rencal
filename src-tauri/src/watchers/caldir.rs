//! Watches the caldir data directory and re-points itself when the directory
//! moves (Settings UI, hand-edited config.toml, the caldir CLI).

use std::path::Path;
use std::sync::Arc;

use notify::RecursiveMode;
use tauri::{AppHandle, Emitter};

use crate::fs_watch::{FsWatch, is_content_change, watch_debounced};
use crate::state::AppState;

// When calendar data in the user's caldir changes:
pub const CALDIR_CHANGED: &str = "caldir-changed";

fn is_ics_event_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("ics"))
}

/// Only `.ics` event files matter — skip `.caldir/` sync state, `.git/`, etc.
fn is_ics_change(event: &notify::Event) -> bool {
    is_content_change(event) && event.paths.iter().any(|path| is_ics_event_file(path))
}

/// Emits `CALDIR_CHANGED` whenever an `.ics` file under the current data dir is
/// created, deleted, or modified. Runs for the life of the app.
pub async fn run_watcher(app: AppHandle, state: Arc<AppState>) {
    let mut config = state.subscribe_caldir_config();

    loop {
        let data_dir = config.borrow_and_update().data_dir();
        let mut watch = open_watch(&data_dir);

        // Runs until the data dir moves; a watch that could not be opened (or
        // died) just idles here until then.
        loop {
            tokio::select! {
                changed = config.changed() => {
                    if changed.is_err() {
                        return;
                    }
                    if config.borrow().data_dir() != data_dir {
                        break;
                    }
                }
                changed = wait_changed(&mut watch) => {
                    if changed.is_none() {
                        log::warn!("caldir watcher: watch on {data_dir:?} ended; idle until dir changes");
                        watch = None;
                        continue;
                    }
                    // Blow the whole parsed-event cache rather than mapping
                    // paths to slugs: the re-parse on next access is cheap and
                    // this keeps the watcher simple.
                    log::debug!("caldir watcher: .ics change in {data_dir:?}");
                    state.events.invalidate_all();
                    let _ = app.emit(CALDIR_CHANGED, ());
                }
            }
        }
    }
}

fn open_watch(data_dir: &Path) -> Option<FsWatch> {
    if !data_dir.exists() {
        log::warn!("caldir watcher: {data_dir:?} does not exist; idle until dir changes");
        return None;
    }
    match watch_debounced(&[data_dir], RecursiveMode::Recursive, is_ics_change) {
        Ok(watch) => {
            log::debug!("caldir watcher: watching {data_dir:?}");
            Some(watch)
        }
        Err(err) => {
            log::warn!("caldir watcher: failed to watch {data_dir:?}: {err}");
            None
        }
    }
}

/// `FsWatch::changed` for an optional watch; pends forever without one.
async fn wait_changed(watch: &mut Option<FsWatch>) -> Option<()> {
    match watch {
        Some(watch) => watch.changed().await,
        None => std::future::pending().await,
    }
}

#[cfg(test)]
mod tests {
    use super::is_ics_event_file;
    use std::path::Path;

    #[test]
    fn matches_ics_files_only() {
        assert!(is_ics_event_file(Path::new("/cal/work/event.ics")));
        assert!(is_ics_event_file(Path::new("/cal/work/EVENT.ICS")));
        assert!(!is_ics_event_file(Path::new(
            "/cal/work/.caldir/state.json"
        )));
        assert!(!is_ics_event_file(Path::new("/cal/work/config.toml")));
    }
}
