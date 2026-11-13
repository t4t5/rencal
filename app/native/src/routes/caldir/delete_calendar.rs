use crate::routes::RpcResult;
use crate::state::AppState;

pub(super) fn handler(state: &AppState, calendar_slug: String) -> RpcResult<()> {
    let calendar = state.caldir().calendar(&calendar_slug)?;
    std::fs::remove_dir_all(calendar.path())?;

    state.invalidate_events(&calendar_slug);
    state.notify_calendars_changed();

    Ok(())
}
