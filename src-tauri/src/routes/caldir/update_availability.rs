use super::availability::{apply_draft, find};
use super::types::AvailabilityDraft;
use crate::routes::TauResult;
use crate::state::AppState;

pub(super) fn handler(state: &AppState, id: String, draft: AvailabilityDraft) -> TauResult<()> {
    let mut file = find(&state.caldir(), &id)?;
    let availability = apply_draft(file.availability(), &draft)?;
    file.save(availability)?;

    state.notify_availabilities_changed();
    Ok(())
}
