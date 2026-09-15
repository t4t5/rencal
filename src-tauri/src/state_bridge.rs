//! The one task that turns `AppState` notifications into webview events.
//! `AppState` itself stays Tauri-free; every window gets these broadcasts.

use std::sync::Arc;

use tauri::{AppHandle, Emitter};

use crate::routes::caldir::tildify;
use crate::state::AppState;

// When the caldir data directory moves (Settings UI, hand-edited config.toml).
// Payload: the new path, tildified for display.
pub const CALENDAR_DIR_CHANGED: &str = "calendar-dir-changed";

pub async fn run(app: AppHandle, state: Arc<AppState>) {
    let mut config = state.subscribe_caldir_config();
    let mut data_dir = config.borrow_and_update().data_dir();

    while config.changed().await.is_ok() {
        let next = config.borrow_and_update().data_dir();
        if next == data_dir {
            continue;
        }
        data_dir = next;
        log::info!("calendar dir changed to {data_dir:?}");
        let _ = app.emit(CALENDAR_DIR_CHANGED, tildify(&data_dir.to_string_lossy()));
    }
}
