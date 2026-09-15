use crate::routes::TauResult;
use crate::state::AppState;
use crate::watchers::caldir::CALDIR_CHANGED;
use tauri::{AppHandle, Emitter, Runtime};

pub(super) fn handler<R: Runtime>(
    state: &AppState,
    app: &AppHandle<R>,
    calendar_slug: String,
) -> TauResult<()> {
    let calendar = state
        .caldir()
        .calendar(&calendar_slug)
        .map_err(|e| e.to_string())?;
    std::fs::remove_dir_all(calendar.path()).map_err(|e| e.to_string())?;

    state.events.invalidate(&calendar_slug);
    let _ = app.emit(CALDIR_CHANGED, ());

    Ok(())
}
