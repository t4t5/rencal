use super::helpers::load_caldir;
use super::types::Calendar;
use crate::routes::TauResult;

pub(super) async fn handler() -> TauResult<Vec<Calendar>> {
    let caldir = load_caldir()?;
    let calendars = caldir
        .calendars()
        .into_iter()
        .filter_map(Result::ok)
        .map(|c| Calendar::from(&c))
        .collect();
    Ok(calendars)
}
