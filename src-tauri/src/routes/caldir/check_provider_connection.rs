use super::helpers::provider;
use crate::routes::TauResult;
use crate::routes::error::RpcError;
use crate::state::AppState;

pub(super) async fn handler(
    state: &AppState,
    provider_name: String,
    account: String,
) -> TauResult<()> {
    let provider = provider(state, &provider_name)?;

    provider
        .provider_account(account)
        .list_calendars()
        .await
        .map_err(|e| RpcError::from(e).context("Failed to list calendars"))?;

    Ok(())
}
