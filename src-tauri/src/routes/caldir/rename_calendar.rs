use crate::routes::TauResult;
use crate::state::AppState;

pub(super) fn handler(state: &AppState, calendar_slug: String, name: String) -> TauResult<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Calendar name cannot be empty".to_string());
    }

    let calendar = state
        .caldir()
        .calendar(&calendar_slug)
        .map_err(|e| e.to_string())?;

    let mut config = calendar.config().cloned().unwrap_or_default();
    config.set_name(Some(name.to_string()));

    config
        .write(&calendar.config_path())
        .map_err(|e| e.to_string())?;
    state.notify_calendars_changed();

    Ok(())
}
