use super::availability::find;
use super::availability_draft::apply;
use super::types::AvailabilityDraft;
use crate::routes::TauResult;
use crate::state::AppState;

pub(super) fn handler(state: &AppState, id: String, draft: AvailabilityDraft) -> TauResult<()> {
    let mut file = find(&state.caldir(), &id)?;
    let availability = apply(file.availability(), &draft)?;
    file.save(availability)?;

    state.notify_availabilities_changed();
    Ok(())
}
