use crate::routes::TauResult;
use crate::state::AppState;

/// The one deliberate `PATH` rescan: a provider installed while the app runs
/// shows up the moment Settings › Accounts opens. Every other handler reads
/// the registry loaded at startup.
pub(super) fn handler(state: &AppState) -> TauResult<Vec<String>> {
    state.rescan_providers();

    let mut names: Vec<String> = state
        .caldir()
        .providers()
        .slugs()
        .into_iter()
        .map(|s| s.to_string())
        .collect();

    names.sort();

    Ok(names)
}
