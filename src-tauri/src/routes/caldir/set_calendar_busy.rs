use crate::routes::TauResult;
use crate::state::AppState;

/// Whether `calendar_slug`'s events block availability. Matching the default
/// (on unless read-only) clears the setting instead of writing it.
pub(super) fn handler(state: &AppState, calendar_slug: String, busy: bool) -> TauResult<()> {
    let calendar = state.caldir().calendar(&calendar_slug)?;
    let mut config = calendar.config().cloned().unwrap_or_default();
    let default = !calendar.is_read_only();
    config.set_busy((busy != default).then_some(busy));

    config.write(&calendar.config_path())?;
    state.notify_calendars_changed();

    Ok(())
}
