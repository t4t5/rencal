use super::helpers::provider;
use crate::error::CoreError;
use crate::error::CoreResult;
use crate::state::AppState;

pub async fn check_provider_connection(
    state: &AppState,
    provider_name: String,
    account: String,
) -> CoreResult<()> {
    let provider = provider(state, &provider_name)?;

    provider
        .provider_account(account)
        .list_calendars()
        .await
        .map_err(|e| CoreError::from(e).context("Failed to list calendars"))?;

    Ok(())
}
