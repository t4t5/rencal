use super::types::Calendar;
use crate::routes::TauResult;
use crate::state::AppState;
use caldir_core::CalendarConfig;

pub(super) fn handler(
    state: &AppState,
    name: String,
    color: Option<String>,
) -> TauResult<Calendar> {
    let base_slug = caldir_core::Calendar::base_slug_for(Some(&name));

    let config = CalendarConfig::new(Some(name), color, None, None);

    let calendar = {
        let cal = state
            .caldir()
            .create_calendar(&base_slug, Some(config))
            .map_err(|e| e.to_string())?;
        Calendar::from(&cal)
    };
    state.notify_calendars_changed();

    Ok(calendar)
}
