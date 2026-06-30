use std::path::Path;
use std::time::Duration;

use caldir_core::Caldir;
use notify::event::ModifyKind;
use notify::{Event, EventKind, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Listener};
use tokio::sync::mpsc;
use tokio::time::sleep;

use crate::event_cache::EVENT_CACHE;

// When calendar data in the user's caldir changes:
pub const CALDIR_CHANGED: &str = "caldir-changed";

// When user picks new base caldir directory:
const CALENDAR_DIR_CHANGED: &str = "calendar-dir-changed";

fn is_ics_event_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("ics"))
}

/// Watches the user's caldir directory recursively and emits `CALDIR_CHANGED`
/// whenever an `.ics` event file is created, deleted, or modified.
pub async fn run_watcher(app: AppHandle) {
    // Fires whenever the calendar dir changes, so we can tear down the watch on
    // the old directory and re-point at the new one.
    let (dir_tx, mut dir_rx) = mpsc::unbounded_channel::<()>();

    app.listen(CALENDAR_DIR_CHANGED, move |_| {
        let _ = dir_tx.send(());
    });

    loop {
        // Returns when the calendar dir changes (re-point) or when the current
        // dir can't be watched (wait for the next dir change before retrying).
        watch_current_dir(&app, &mut dir_rx).await;
        // Collapse any extra change signals queued while we were tearing down.
        while dir_rx.try_recv().is_ok() {}
    }
}

/// Watches the directory currently configured in caldir until either the
/// calendar dir changes (signalled via `dir_rx`) or the watch can't be set up.
/// On a setup failure it parks on `dir_rx` so the caller doesn't busy-loop.
async fn watch_current_dir(app: &AppHandle, dir_rx: &mut mpsc::UnboundedReceiver<()>) {
    let Ok(caldir) = Caldir::load() else {
        log::warn!("caldir watcher: failed to load caldir config");
        let _ = dir_rx.recv().await;
        return;
    };
    let watch_dir = caldir.data_dir();
    if !watch_dir.exists() {
        log::warn!("caldir watcher: {watch_dir:?} does not exist; idle until dir changes");
        let _ = dir_rx.recv().await;
        return;
    }

    let (tx, mut rx) = mpsc::unbounded_channel::<()>();

    let mut watcher = match notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            // Ignore Modify::Metadata — on Linux with `relatime`, our own reads of
            // .ics files update atime and surface as metadata-modify events, which
            // would otherwise fire CALDIR_CHANGED for every startup read pass.
            let is_real_change = matches!(
                event.kind,
                EventKind::Create(_)
                    | EventKind::Remove(_)
                    | EventKind::Modify(ModifyKind::Data(_))
                    | EventKind::Modify(ModifyKind::Name(_))
            );
            // Only `.ics` event files matter — skip `.caldir/` sync state, `.git/`, etc.
            if is_real_change && event.paths.iter().any(|p| is_ics_event_file(p)) {
                let _ = tx.send(());
            }
        }
    }) {
        Ok(w) => w,
        Err(e) => {
            log::warn!("caldir watcher: failed to init: {e}");
            let _ = dir_rx.recv().await;
            return;
        }
    };

    if let Err(e) = watcher.watch(&watch_dir, RecursiveMode::Recursive) {
        log::warn!("caldir watcher: failed to watch {watch_dir:?}: {e}");
        let _ = dir_rx.recv().await;
        return;
    }

    loop {
        tokio::select! {
            // Calendar dir changed: stop watching the old directory and let the
            // caller re-point. The cache was already invalidated by the
            // `set_calendar_dir` handler before this event was emitted.
            _ = dir_rx.recv() => {
                drop(watcher);
                return;
            }
            // A file inside the watched directory changed.
            msg = rx.recv() => {
                if msg.is_none() {
                    drop(watcher);
                    return;
                }
                // Coalesce bursts (e.g. sync writing many files in quick succession).
                sleep(Duration::from_millis(150)).await;
                while rx.try_recv().is_ok() {}

                // Blow the parsed-event cache so the next read re-parses from disk.
                // We invalidate everything rather than parsing slugs from paths —
                // the cost of re-parsing on next access is small, and this keeps
                // the watcher simple.
                EVENT_CACHE.invalidate_all();

                let _ = app.emit(CALDIR_CHANGED, ());
            }
        }
    }
}
