use super::helpers::{build_connect_options, provider, save_connected_calendars};
use super::types::Calendar;
use crate::oauth;
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};
use crate::state::AppState;
use caldir_core::Provider;
use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;

pub(super) async fn handler<R: Runtime>(
    state: &AppState,
    app: AppHandle<R>,
    provider_name: String,
) -> TauResult<Vec<Calendar>> {
    let provider = provider(state, &provider_name)?;

    // Bind callback listener first on port 0 so the OS picks a free port
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

    run_with_data(
        state,
        app,
        &provider,
        build_connect_options(true, &redirect_uri),
        serde_json::Map::new(),
        listener,
        redirect_uri,
    )
    .await
}

pub(super) async fn run_with_data<R: Runtime>(
    state: &AppState,
    app: AppHandle<R>,
    provider: &Provider,
    options: serde_json::Map<String, serde_json::Value>,
    initial_data: serde_json::Map<String, serde_json::Value>,
    listener: tokio::net::TcpListener,
    redirect_uri: String,
) -> TauResult<Vec<Calendar>> {
    use caldir_core::rpc::ConnectResponse;

    let mut data = initial_data;
    let mut listener = Some(listener);

    loop {
        let connect_response = provider
            .connect(options.clone(), data)
            .await
            .map_err(|e| RpcError::from(e).context("Connect failed"))?;

        match connect_response {
            ConnectResponse::Done {
                account_identifier,
                calendars,
            } => {
                return save_connected_calendars(state, provider, account_identifier, calendars)
                    .await;
            }
            ConnectResponse::NeedsInput {
                step,
                data: step_data,
            } => {
                data =
                    run_connect_step(&app, step, step_data, &mut listener, &redirect_uri).await?;
            }
        }
    }
}

async fn run_connect_step<R: Runtime>(
    app: &AppHandle<R>,
    step: caldir_core::rpc::ConnectStepKind,
    step_data: serde_json::Value,
    listener: &mut Option<tokio::net::TcpListener>,
    redirect_uri: &str,
) -> TauResult<serde_json::Map<String, serde_json::Value>> {
    use caldir_core::rpc::{ConnectStepKind, HostedOAuthData, OAuthData};

    match step {
        ConnectStepKind::OAuthRedirect => {
            let listener = listener.take().ok_or_else(|| {
                RpcError::new(
                    RpcErrorKind::ProviderFailure,
                    "Provider requested multiple browser callbacks",
                )
            })?;
            let oauth_data: OAuthData = serde_json::from_value(step_data).map_err(|e| {
                RpcError::new(
                    RpcErrorKind::ProviderFailure,
                    format!("Failed to parse OAuth data: {e}"),
                )
            })?;

            let auth_url = url::Url::parse(&oauth_data.authorization_url).map_err(|e| {
                RpcError::new(RpcErrorKind::InvalidInput, format!("Invalid auth URL: {e}"))
            })?;

            app.opener()
                .open_url(auth_url.as_str(), None::<&str>)
                .map_err(|e| {
                    RpcError::new(
                        RpcErrorKind::Internal,
                        format!("Failed to open browser: {e}"),
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
            let callback = oauth::server::handle_oauth_callback(listener, port)
                .await
                .map_err(|e| {
                    let kind = if e.downcast_ref::<std::io::Error>().is_some() {
                        RpcErrorKind::Io
                    } else {
                        RpcErrorKind::Authentication
                    };
                    RpcError::new(kind, format!("OAuth callback failed: {e}"))
                })?;

            if callback.state != oauth_data.state {
                return Err(RpcError::new(
                    RpcErrorKind::Authentication,
                    "OAuth state mismatch",
                ));
            }

            let mut credentials = serde_json::Map::new();
            credentials.insert("code".into(), serde_json::Value::String(callback.code));
            credentials.insert("state".into(), serde_json::Value::String(callback.state));
            credentials.insert(
                "redirect_uri".into(),
                serde_json::Value::String(redirect_uri.to_string()),
            );
            Ok(credentials)
        }
        ConnectStepKind::HostedOAuth => {
            let listener = listener.take().ok_or_else(|| {
                RpcError::new(
                    RpcErrorKind::ProviderFailure,
                    "Provider requested multiple browser callbacks",
                )
            })?;
            let hosted_data: HostedOAuthData = serde_json::from_value(step_data).map_err(|e| {
                RpcError::new(
                    RpcErrorKind::ProviderFailure,
                    format!("Failed to parse HostedOAuth data: {e}"),
                )
            })?;

            let auth_url = url::Url::parse(&hosted_data.url).map_err(|e| {
                RpcError::new(
                    RpcErrorKind::InvalidInput,
                    format!("Invalid hosted auth URL: {e}"),
                )
            })?;

            app.opener()
                .open_url(auth_url.as_str(), None::<&str>)
                .map_err(|e| {
                    RpcError::new(
                        RpcErrorKind::Internal,
                        format!("Failed to open browser: {e}"),
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
            let params = oauth::server::handle_generic_callback(listener, port)
                .await
                .map_err(|e| {
                    let kind = if e.downcast_ref::<std::io::Error>().is_some() {
                        RpcErrorKind::Io
                    } else {
                        RpcErrorKind::Authentication
                    };
                    RpcError::new(kind, format!("OAuth callback failed: {e}"))
                })?;

            for key in ["access_token", "refresh_token", "expires_in"] {
                if !params.contains_key(key) {
                    return Err(RpcError::new(
                        RpcErrorKind::Authentication,
                        format!("OAuth callback missing {key}"),
                    ));
                }
            }

            let mut credentials = serde_json::Map::new();
            for (key, value) in params {
                credentials.insert(key, serde_json::Value::String(value));
            }
            Ok(credentials)
        }
        ConnectStepKind::Credentials => Err(RpcError::new(
            RpcErrorKind::Configuration,
            "Provider requires credentials before it can connect",
        )),
        ConnectStepKind::NeedsSetup => Err(RpcError::new(
            RpcErrorKind::Configuration,
            "Provider requires setup before it can connect",
        )),
    }
}
