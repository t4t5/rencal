use crate::error::CoreResult;
use crate::state::AppState;

pub fn delete_calendar(state: &AppState, calendar_slug: String) -> CoreResult<()> {
    let calendar = state.caldir().calendar(&calendar_slug)?;
    std::fs::remove_dir_all(calendar.path())?;

    state.invalidate_events(&calendar_slug);
    state.notify_calendars_changed();

    Ok(())
}
