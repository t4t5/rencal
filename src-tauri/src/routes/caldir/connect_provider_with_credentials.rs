use super::helpers::save_provider_calendars;
use super::types::{Calendar, CredentialFieldInput};
use crate::routes::TauResult;
use caldir_core::{Caldir, ProviderSlug};

pub(super) async fn handler(
    provider_name: String,
    credentials: Vec<CredentialFieldInput>,
) -> TauResult<Vec<Calendar>> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let provider = caldir
        .provider(&ProviderSlug::from(provider_name.as_str()))
        .map_err(|e| e.to_string())?;

    let mut cred_map = serde_json::Map::new();
    for field in credentials {
        cred_map.insert(field.id, serde_json::Value::String(field.value));
    }

    save_provider_calendars(provider, serde_json::Map::new(), cred_map).await
}
