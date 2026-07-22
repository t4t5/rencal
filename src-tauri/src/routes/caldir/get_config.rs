use super::helpers::load_caldir;
use super::helpers::tildify;
use super::types::{DataDirStatus, TimeFormat};
use crate::routes::TauResult;
use caldir_core::TimeFormat as CoreTimeFormat;

pub(super) async fn get_time_format() -> TauResult<TimeFormat> {
    let caldir = load_caldir()?;
    let tf = match caldir.config().time_format() {
        CoreTimeFormat::H24 => TimeFormat::H24,
        CoreTimeFormat::H12 => TimeFormat::H12,
    };
    Ok(tf)
}

pub(super) async fn get_default_reminders() -> TauResult<Vec<i32>> {
    let caldir = load_caldir()?;
    let Some(reminders) = caldir.config().default_reminders() else {
        return Ok(Vec::new());
    };
    Ok(reminders
        .into_iter()
        .map(|r| r.minutes_before_start as i32)
        .collect())
}

pub(super) async fn get_default_calendar() -> TauResult<Option<String>> {
    let caldir = load_caldir()?;
    Ok(caldir.config().default_calendar_slug().map(String::from))
}

pub(super) async fn get_calendar_dir() -> TauResult<String> {
    let caldir = load_caldir()?;
    Ok(tildify(&caldir.config().data_dir().to_string_lossy()))
}

pub(super) async fn get_data_dir_status() -> TauResult<DataDirStatus> {
    let data_dir = crate::caldir_access::configured_host_path()?;
    let path = tildify(&data_dir.to_string_lossy());

    if crate::caldir_access::has_valid_access()? {
        Ok(DataDirStatus::Ready { path })
    } else {
        Ok(DataDirStatus::NeedsAuthorization { path })
    }
}
