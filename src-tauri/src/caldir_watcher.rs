use std::time::Duration;

use caldir_core::caldir::Caldir;
use notify::event::ModifyKind;
use notify::{Event, EventKind, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio::time::sleep;

pub const CALDIR_CHANGED: &str = "caldir-changed";

/// Watches the user's caldir directory recursively and emits `CALDIR_CHANGED`
/// whenever anything inside changes. The frontend uses this to keep the event
/// list in sync with the directory — whether the change came from Rencal, a
/// CLI tool, a git pull, or another editor.
pub async fn run_watcher(app: AppHandle) {
    let Ok(caldir) = Caldir::load() else {
        log::warn!("caldir watcher: failed to load caldir config");
        return;
    };
    let watch_dir = caldir.data_path();
    if !watch_dir.exists() {
        log::warn!("caldir watcher: {watch_dir:?} does not exist; watcher disabled");
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
            if is_real_change {
                let _ = tx.send(());
            }
        }
    }) {
        Ok(w) => w,
        Err(e) => {
            log::warn!("caldir watcher: failed to init: {e}");
            return;
        }
    };

    if let Err(e) = watcher.watch(&watch_dir, RecursiveMode::Recursive) {
        log::warn!("caldir watcher: failed to watch {watch_dir:?}: {e}");
        return;
    }

    while rx.recv().await.is_some() {
        // Coalesce bursts (e.g. sync writing many files in quick succession).
        sleep(Duration::from_millis(150)).await;
        while rx.try_recv().is_ok() {}

        let _ = app.emit(CALDIR_CHANGED, ());
    }

    drop(watcher);
}
