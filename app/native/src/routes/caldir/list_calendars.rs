use super::types::Calendar;
use crate::routes::RpcResult;
use crate::state::AppState;

pub(super) fn handler(state: &AppState) -> RpcResult<Vec<Calendar>> {
    let calendars = state
        .caldir()
        .calendars()
        .into_iter()
        .filter_map(Result::ok)
        .map(|c| Calendar::from(&c))
        .collect();
    Ok(calendars)
}
