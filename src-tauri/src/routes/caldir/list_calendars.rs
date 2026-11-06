use super::types::Calendar;
use crate::routes::TauResult;
use crate::state::AppState;

pub(super) fn handler(state: &AppState) -> TauResult<Vec<Calendar>> {
    let calendars = state
        .caldir()
        .calendars()
        .into_iter()
        .filter_map(Result::ok)
        .map(|c| Calendar::from(&c))
        .collect();
    Ok(calendars)
}
