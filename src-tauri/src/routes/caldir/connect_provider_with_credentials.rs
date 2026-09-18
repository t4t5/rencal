use super::connect_provider;
use super::helpers::{build_connect_options, provider};
use super::types::{Calendar, CredentialFieldInput};
use crate::oauth;
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};
use crate::state::AppState;
use tauri::{AppHandle, Runtime};

pub(super) async fn handler<R: Runtime>(
    state: &AppState,
    app: AppHandle<R>,
    provider_name: String,
    credentials: Vec<CredentialFieldInput>,
) -> TauResult<Vec<Calendar>> {
    let provider = provider(state, &provider_name)?;

    let mut cred_map = serde_json::Map::new();
    for field in credentials {
        cred_map.insert(field.id, serde_json::Value::String(field.value));
    }

    let listener = oauth::server::create_localhost_listener(0).map_err(|e| {
        RpcError::new(
            RpcErrorKind::Io,
            format!("Failed to start callback server: {e}"),
        )
    })?;
    let port = listener
        .local_addr()
        .map_err(|e| {
            RpcError::new(
                RpcErrorKind::Io,
                format!("Failed to get listener port: {e}"),
            )
        })?
        .port();
    let redirect_uri = format!("http://localhost:{}/callback", port);

    connect_provider::run_with_data(
        state,
        app,
        &provider,
        build_connect_options(true, &redirect_uri),
        cred_map,
        listener,
        redirect_uri,
    )
    .await
}
