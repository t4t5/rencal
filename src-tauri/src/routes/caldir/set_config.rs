use super::helpers::load_caldir;
use super::helpers::tildify;
use super::types::TimeFormat;
use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use caldir_core::{Reminder, TimeFormat as CoreTimeFormat};

pub(super) async fn set_time_format(time_format: TimeFormat) -> TauResult<()> {
    let mut caldir = load_caldir()?;
    let core_tf = match time_format {
        TimeFormat::H24 => CoreTimeFormat::H24,
        TimeFormat::H12 => CoreTimeFormat::H12,
    };
    let mut config = caldir.config().clone();
    config.set_time_format(core_tf);
    caldir.save_config(config).map_err(|e| e.to_string())?;
    Ok(())
}

pub(super) async fn set_default_reminders(minutes: Vec<i32>) -> TauResult<()> {
    let mut caldir = load_caldir()?;
    let mut config = caldir.config().clone();
    let reminders = if minutes.is_empty() {
        None
    } else {
        Some(
            minutes
                .into_iter()
                .map(|m| Reminder::from_minutes(m as i64))
                .collect(),
        )
    };
    config.set_default_reminders(reminders);
    caldir.save_config(config).map_err(|e| e.to_string())?;
    Ok(())
}

pub(super) async fn set_default_calendar(slug: Option<String>) -> TauResult<()> {
    let mut caldir = load_caldir()?;
    let mut config = caldir.config().clone();
    config.set_default_calendar_slug(slug);
    caldir.save_config(config).map_err(|e| e.to_string())?;
    Ok(())
}

pub(super) async fn set_calendar_dir(path: String) -> TauResult<()> {
    let mut caldir = load_caldir()?;
    let mut config = caldir.config().clone();

    config.set_data_dir(std::path::PathBuf::from(tildify(&path)));
    caldir.save_config(config).map_err(|e| e.to_string())?;

    EVENT_CACHE.invalidate_all();

    Ok(())
}
