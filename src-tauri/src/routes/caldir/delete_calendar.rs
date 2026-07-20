use super::helpers::load_caldir;
use crate::caldir_watcher::CALDIR_CHANGED;
use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use tauri::{AppHandle, Emitter, Runtime};

pub(super) async fn handler<R: Runtime>(app: AppHandle<R>, calendar_slug: String) -> TauResult<()> {
    let caldir = load_caldir()?;
    let calendar = caldir.calendar(&calendar_slug).map_err(|e| e.to_string())?;
    std::fs::remove_dir_all(calendar.path()).map_err(|e| e.to_string())?;

    EVENT_CACHE.invalidate(&calendar_slug);
    let _ = app.emit(CALDIR_CHANGED, ());

    Ok(())
}
