use super::availability::find;
use crate::routes::TauResult;
use crate::state::AppState;

pub(super) fn handler(state: &AppState, id: String) -> TauResult<()> {
    find(&state.caldir(), &id)?.delete()?;

    state.notify_availabilities_changed();
    Ok(())
}
