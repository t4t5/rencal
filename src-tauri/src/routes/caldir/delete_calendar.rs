use super::helpers::load_caldir;
use crate::caldir_watcher::CALDIR_CHANGED;
use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use tauri::{AppHandle, Emitter, Runtime};

pub(super) async fn handler<R: Runtime>(app: AppHandle<R>, calendar_slug: String) -> TauResult<()> {
    let caldir = load_caldir()?;
    let mut calendar = None;

    for candidate in caldir.calendars() {
        let candidate = candidate.map_err(|e| e.to_string())?;
        if candidate.slug() == Some(calendar_slug.as_str()) {
            calendar = Some(candidate);
            break;
        }
    }

    let calendar = calendar.ok_or_else(|| format!("Calendar not found: {calendar_slug}"))?;
    std::fs::remove_dir_all(calendar.path()).map_err(|e| e.to_string())?;

    EVENT_CACHE.invalidate(&calendar_slug);
    let _ = app.emit(CALDIR_CHANGED, ());

    Ok(())
}
