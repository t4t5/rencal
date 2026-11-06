use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};
use crate::state::AppState;

pub(super) fn handler(state: &AppState, calendar_slug: String, name: String) -> TauResult<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err(RpcError::new(
            RpcErrorKind::InvalidInput,
            "Calendar name cannot be empty",
        ));
    }

    let calendar = state.caldir().calendar(&calendar_slug)?;

    let mut config = calendar.config().cloned().unwrap_or_default();
    config.set_name(Some(name.to_string()));

    config.write(&calendar.config_path())?;
    state.notify_calendars_changed();

    Ok(())
}
