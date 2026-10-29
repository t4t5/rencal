use super::availability::summary;
use super::types::AvailabilitySummary;
use crate::routes::TauResult;
use crate::state::AppState;

pub(super) fn handler(state: &AppState) -> TauResult<Vec<AvailabilitySummary>> {
    Ok(state
        .caldir()
        .availabilities()?
        .into_iter()
        .map(|(reference, file)| summary(reference, &file))
        .collect())
}
