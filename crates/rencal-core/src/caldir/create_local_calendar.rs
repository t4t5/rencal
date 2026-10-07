use super::types::Calendar;
use crate::error::CoreResult;
use crate::state::AppState;
use caldir_core::CalendarConfig;

pub fn create_local_calendar(
    state: &AppState,
    name: String,
    color: Option<String>,
) -> CoreResult<Calendar> {
    let base_slug = caldir_core::Calendar::base_slug_for(Some(&name));

    let config = CalendarConfig::new(Some(name), color, None, None);

    let calendar = {
        let cal = state.caldir().create_calendar(&base_slug, Some(config))?;
        Calendar::from(&cal)
    };
    state.notify_calendars_changed();

    Ok(calendar)
}
