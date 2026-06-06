use super::helpers::load_caldir;
use crate::routes::TauResult;
use caldir_core::ProviderSlug;

pub(super) async fn handler(provider_name: String, account: String) -> TauResult<()> {
    let caldir = load_caldir()?;
    let provider = caldir
        .provider(&ProviderSlug::from(provider_name.as_str()))
        .map_err(|e| e.to_string())?;

    provider
        .provider_account(account)
        .list_calendars()
        .await
        .map_err(|e| format!("Failed to list calendars: {}", e))?;

    Ok(())
}
