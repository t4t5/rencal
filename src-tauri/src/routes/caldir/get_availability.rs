use super::availability::{details, find, reference};
use super::types::AvailabilityDetails;
use crate::routes::TauResult;
use crate::state::AppState;

pub(super) fn handler(state: &AppState, id: String) -> TauResult<AvailabilityDetails> {
    let caldir = state.caldir();
    let file = find(&caldir, &id)?;
    Ok(details(reference(&caldir, &file)?, &file))
}
