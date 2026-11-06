use crate::routes::TauResult;
use crate::state::{AppState, ProviderInfo};

/// The one deliberate `PATH` rescan: a provider installed while the app runs
/// shows up the moment Settings › Accounts opens. Every other handler reads
/// the registry as of startup or the last plugin reconcile.
pub(super) fn handler(state: &AppState) -> TauResult<Vec<ProviderInfo>> {
    Ok(state.rescan_providers())
}
