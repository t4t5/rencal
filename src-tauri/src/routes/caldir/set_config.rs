use super::helpers::tildify;
use super::types::TimeFormat;
use crate::routes::TauResult;
use crate::routes::error::RpcError;
use crate::state::AppState;
use caldir_core::{Reminder, TimeFormat as CoreTimeFormat};

pub(super) fn set_time_format(state: &AppState, time_format: TimeFormat) -> TauResult<()> {
    let core_tf = match time_format {
        TimeFormat::H24 => CoreTimeFormat::H24,
        TimeFormat::H12 => CoreTimeFormat::H12,
    };
    let mut config = state.caldir().config().clone();
    config.set_time_format(core_tf);
    state.save_caldir_config(config).map_err(RpcError::from)
}

pub(super) fn set_default_reminders(state: &AppState, minutes: Vec<i32>) -> TauResult<()> {
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
    let mut config = state.caldir().config().clone();
    config.set_default_reminders(reminders);
    state.save_caldir_config(config).map_err(RpcError::from)
}

pub(super) fn set_default_calendar(state: &AppState, slug: Option<String>) -> TauResult<()> {
    let mut config = state.caldir().config().clone();
    config.set_default_calendar_slug(slug);
    state.save_caldir_config(config).map_err(RpcError::from)
}

/// Cache invalidation and state notifications happen inside
/// `save_caldir_config`; nothing else to do here.
pub(super) fn set_calendar_dir(state: &AppState, path: String) -> TauResult<()> {
    let mut config = state.caldir().config().clone();
    config.set_data_dir(std::path::PathBuf::from(tildify(&path)));
    state.save_caldir_config(config).map_err(RpcError::from)
}
