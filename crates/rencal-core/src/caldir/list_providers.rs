use crate::error::CoreResult;
use crate::state::{AppState, ProviderInfo};

/// The one deliberate `PATH` rescan: a provider installed while the app runs
/// shows up the moment Settings › Accounts opens. Every other handler reads
/// the registry as of startup or the last plugin reconcile.
pub fn list_providers(state: &AppState) -> CoreResult<Vec<ProviderInfo>> {
    Ok(state.rescan_providers())
}
