use crate::routes::TauResult;
use crate::state::AppState;

pub(super) fn handler(state: &AppState, calendar_slug: String) -> TauResult<()> {
    let calendar = state
        .caldir()
        .calendar(&calendar_slug)
        .map_err(|e| e.to_string())?;
    std::fs::remove_dir_all(calendar.path()).map_err(|e| e.to_string())?;

    state.invalidate_events(&calendar_slug);
    state.notify_calendars_changed();

    Ok(())
}
