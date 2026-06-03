use super::helpers::load_caldir;
use super::types::Calendar;
use crate::routes::TauResult;
use caldir_core::CalendarConfig;

pub(super) async fn handler(name: String, color: Option<String>) -> TauResult<Calendar> {
    let caldir = load_caldir()?;
    let base_slug = caldir_core::Calendar::base_slug_for(Some(&name));

    let config = CalendarConfig::new(Some(name), color, None, None);

    let cal = caldir
        .create_calendar(&base_slug, Some(config))
        .map_err(|e| e.to_string())?;

    Ok(Calendar::from(&cal))
}
