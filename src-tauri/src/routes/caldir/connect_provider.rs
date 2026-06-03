use super::helpers::load_caldir;
use super::helpers::save_provider_calendars;
use super::types::Calendar;
use crate::oauth;
use crate::routes::TauResult;
use caldir_core::ProviderSlug;
use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;

pub(super) async fn handler<R: Runtime>(
    app: AppHandle<R>,
    provider_name: String,
) -> TauResult<Vec<Calendar>> {
    use caldir_core::rpc::{ConnectResponse, ConnectStepKind, HostedOAuthData, OAuthData};

    let caldir = load_caldir()?;
    let provider = caldir
        .provider(&ProviderSlug::from(provider_name.as_str()))
        .map_err(|e| e.to_string())?;

    // Bind callback listener first on port 0 so the OS picks a free port
    let listener = oauth::server::create_localhost_listener(0)
        .map_err(|e| format!("Failed to start callback server: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get listener port: {}", e))?
        .port();
    let redirect_uri = format!("http://localhost:{}/callback", port);

    // Initialize connect flow with the actual callback port
    let mut options = serde_json::Map::new();
    options.insert(
        "redirect_uri".into(),
        serde_json::Value::String(redirect_uri.clone()),
    );
    options.insert("hosted".into(), serde_json::Value::Bool(true));

    let connect_response = provider
        .connect(options, serde_json::Map::new())
        .await
        .map_err(|e| format!("Connect init failed: {}", e))?;

    match connect_response {
        ConnectResponse::NeedsInput {
            step: ConnectStepKind::OAuthRedirect,
            data,
        } => {
            let oauth_data: OAuthData = serde_json::from_value(data)
                .map_err(|e| format!("Failed to parse OAuth data: {}", e))?;

            let auth_url = url::Url::parse(&oauth_data.authorization_url)
                .map_err(|e| format!("Invalid auth URL: {}", e))?;

            app.opener()
                .open_url(auth_url.as_str(), None::<&str>)
                .map_err(|e| format!("Failed to open browser: {}", e))?;

            let callback = oauth::server::handle_oauth_callback(listener, port)
                .await
                .map_err(|e| format!("OAuth callback failed: {}", e))?;

            let mut credentials = serde_json::Map::new();
            credentials.insert("code".into(), serde_json::Value::String(callback.code));
            credentials.insert("state".into(), serde_json::Value::String(callback.state));

            let mut opts = serde_json::Map::new();
            opts.insert(
                "redirect_uri".into(),
                serde_json::Value::String(redirect_uri),
            );

            save_provider_calendars(provider, opts, credentials).await
        }
        ConnectResponse::NeedsInput {
            step: ConnectStepKind::HostedOAuth,
            data,
        } => {
            let hosted_data: HostedOAuthData = serde_json::from_value(data)
                .map_err(|e| format!("Failed to parse HostedOAuth data: {}", e))?;

            let auth_url = url::Url::parse(&hosted_data.url)
                .map_err(|e| format!("Invalid hosted auth URL: {}", e))?;

            app.opener()
                .open_url(auth_url.as_str(), None::<&str>)
                .map_err(|e| format!("Failed to open browser: {}", e))?;

            let params = oauth::server::handle_generic_callback(listener, port)
                .await
                .map_err(|e| format!("OAuth callback failed: {}", e))?;

            let mut credentials = serde_json::Map::new();
            for (key, value) in params {
                credentials.insert(key, serde_json::Value::String(value));
            }

            let mut opts = serde_json::Map::new();
            opts.insert(
                "redirect_uri".into(),
                serde_json::Value::String(redirect_uri),
            );
            opts.insert("hosted".into(), serde_json::Value::Bool(true));

            save_provider_calendars(provider, opts, credentials).await
        }
        _ => Err("Unsupported connect step for this flow".to_string()),
    }
}
