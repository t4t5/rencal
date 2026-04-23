use std::time::Duration;

use caldir_core::caldir::Caldir;
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
        eprintln!("caldir watcher: failed to load caldir config");
        return;
    };
    let watch_dir = caldir.data_path();
    if !watch_dir.exists() {
        eprintln!("caldir watcher: {watch_dir:?} does not exist; watcher disabled");
        return;
    }

    let (tx, mut rx) = mpsc::unbounded_channel::<()>();

    let mut watcher = match notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            if matches!(
                event.kind,
                EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
            ) {
                let _ = tx.send(());
            }
        }
    }) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("caldir watcher: failed to init: {e}");
            return;
        }
    };

    if let Err(e) = watcher.watch(&watch_dir, RecursiveMode::Recursive) {
        eprintln!("caldir watcher: failed to watch {watch_dir:?}: {e}");
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
