use super::types::Calendar;
use crate::routes::TauResult;
use caldir_core::Caldir;

pub(super) async fn handler() -> TauResult<Vec<Calendar>> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let calendars = caldir
        .calendars()
        .into_iter()
        .filter_map(Result::ok)
        .map(|c| Calendar::from(&c))
        .collect();
    Ok(calendars)
}
