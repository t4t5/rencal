use crate::routes::TauResult;
use crate::state::AppState;

/// Slugs of the availability directories, for asking where a new one goes.
pub(super) fn handler(state: &AppState) -> TauResult<Vec<String>> {
    Ok(state
        .caldir()
        .availability_dirs()
        .iter()
        .filter_map(|dir| dir.slug().map(str::to_string))
        .collect())
}
