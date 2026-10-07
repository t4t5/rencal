use super::types::Calendar;
use crate::error::CoreResult;
use crate::state::AppState;

pub fn list_calendars(state: &AppState) -> CoreResult<Vec<Calendar>> {
    let calendars = state
        .caldir()
        .calendars()
        .into_iter()
        .filter_map(Result::ok)
        .map(|c| Calendar::from(&c))
        .collect();
    Ok(calendars)
}
