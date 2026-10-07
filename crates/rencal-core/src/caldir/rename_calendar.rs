use crate::error::CoreResult;
use crate::error::{CoreError, CoreErrorKind};
use crate::state::AppState;

pub fn rename_calendar(state: &AppState, calendar_slug: String, name: String) -> CoreResult<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err(CoreError::new(
            CoreErrorKind::InvalidInput,
            "Calendar name cannot be empty",
        ));
    }

    let calendar = state.caldir().calendar(&calendar_slug)?;

    let mut config = calendar.config().cloned().unwrap_or_default();
    config.set_name(Some(name.to_string()));

    config.write(&calendar.config_path())?;
    state.notify_calendars_changed();

    Ok(())
}
