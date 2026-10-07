use super::connect_provider::{self, OpenUrl};
use super::helpers::{build_connect_options, provider};
use super::types::{Calendar, CredentialFieldInput};
use crate::error::CoreResult;
use crate::error::{CoreError, CoreErrorKind};
use crate::oauth;
use crate::state::AppState;

pub async fn connect_provider_with_credentials(
    state: &AppState,
    open_url: OpenUrl<'_>,
    provider_name: String,
    credentials: Vec<CredentialFieldInput>,
) -> CoreResult<Vec<Calendar>> {
    let provider = provider(state, &provider_name)?;

    let mut cred_map = serde_json::Map::new();
    for field in credentials {
        cred_map.insert(field.id, serde_json::Value::String(field.value));
    }

    let listener = oauth::server::create_localhost_listener(0).map_err(|e| {
        CoreError::new(
            CoreErrorKind::Io,
            format!("Failed to start callback server: {e}"),
        )
    })?;
    let port = listener
        .local_addr()
        .map_err(|e| {
            CoreError::new(
                CoreErrorKind::Io,
                format!("Failed to get listener port: {e}"),
            )
        })?
        .port();
    let redirect_uri = format!("http://localhost:{}/callback", port);

    connect_provider::run_with_data(
        state,
        open_url,
        &provider,
        build_connect_options(true, &redirect_uri),
        cred_map,
        listener,
        redirect_uri,
    )
    .await
}
