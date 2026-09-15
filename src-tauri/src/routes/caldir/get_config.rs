use super::helpers::tildify;
use super::types::TimeFormat;
use crate::routes::TauResult;
use crate::state::AppState;
use caldir_core::TimeFormat as CoreTimeFormat;

pub(super) fn get_time_format(state: &AppState) -> TauResult<TimeFormat> {
    let tf = match state.caldir().config().time_format() {
        CoreTimeFormat::H24 => TimeFormat::H24,
        CoreTimeFormat::H12 => TimeFormat::H12,
    };
    Ok(tf)
}

pub(super) fn get_default_reminders(state: &AppState) -> TauResult<Vec<i32>> {
    let Some(reminders) = state.caldir().config().default_reminders() else {
        return Ok(Vec::new());
    };
    Ok(reminders
        .into_iter()
        .map(|r| r.minutes_before_start as i32)
        .collect())
}

pub(super) fn get_default_calendar(state: &AppState) -> TauResult<Option<String>> {
    Ok(state
        .caldir()
        .config()
        .default_calendar_slug()
        .map(String::from))
}

pub(super) fn get_calendar_dir(state: &AppState) -> TauResult<String> {
    Ok(tildify(&state.caldir().data_dir().to_string_lossy()))
}
