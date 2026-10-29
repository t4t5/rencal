use caldir_core::availability::Availability;

use super::availability_draft::apply;
use super::types::AvailabilityDraft;
use crate::routes::TauResult;
use crate::state::AppState;

/// Writes a new file and returns its id. `dir` picks the availability
/// directory when there are several; core creates `availability/` when there
/// are none.
pub(super) fn handler(
    state: &AppState,
    draft: AvailabilityDraft,
    dir: Option<String>,
) -> TauResult<String> {
    let availability = apply(&Availability::new(Vec::new()), &draft)?;
    let id = state
        .caldir()
        .availability_dir_for_new(dir.as_deref())?
        .create(availability)?
        .qualified_reference();

    state.notify_availabilities_changed();
    Ok(id)
}
