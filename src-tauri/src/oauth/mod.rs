mod server;
mod window;

use anyhow::{Context, Result};
use oauth2::basic::BasicClient;
use oauth2::reqwest::async_http_client;
use oauth2::{
    AccessToken, AuthUrl, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge, RedirectUrl, Scope,
    TokenResponse, TokenUrl,
};
use tauri::{AppHandle, Runtime};

/// Configuration for an OAuth 2.0 flow
pub struct OAuthConfig {
    pub client_id: String,
    pub client_secret: String,
    pub auth_url: String,
    pub token_url: String,
    pub redirect_port: u16,
    pub scopes: Vec<String>,
    pub window_title: String,
}

/// Runs a complete OAuth 2.0 PKCE flow with popup window and localhost callback
/// 1. Creates a localhost HTTP server for OAuth callback
/// 2. Opens a popup window with the OAuth provider's authorization page
/// 3. Waits for either callback success or window close (cancellation)
/// 4. Exchanges authorization code for access token
pub async fn handle_oauth<R: Runtime>(
    app: AppHandle<R>,
    config: OAuthConfig,
) -> Result<AccessToken> {
    // Create OAuth client
    let client = BasicClient::new(
        ClientId::new(config.client_id),
        Some(ClientSecret::new(config.client_secret)),
        AuthUrl::new(config.auth_url).context("Invalid auth URL")?,
        Some(TokenUrl::new(config.token_url).context("Invalid token URL")?),
    )
    .set_redirect_uri(
        RedirectUrl::new(format!(
            "http://localhost:{}/callback",
            config.redirect_port
        ))
        .context("Invalid redirect URL")?,
    );

    // Generate PKCE challenge for security
    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    // Generate authorization URL with scopes
    let mut auth_url_builder = client
        .authorize_url(CsrfToken::new_random)
        .set_pkce_challenge(pkce_challenge);

    for scope in config.scopes {
        auth_url_builder = auth_url_builder.add_scope(Scope::new(scope));
    }

    let (auth_url, _csrf_token) = auth_url_builder.url();

    // Start localhost HTTP server for callback
    let listener = server::create_localhost_listener(config.redirect_port)
        .context("Failed to create OAuth callback server")?;

    // Create popup window and set up close detection
    let (window, close_rx) = window::create_oauth_popup(&app, auth_url, &config.window_title)
        .context("Failed to create OAuth popup window")?;

    // Race between OAuth callback and window close
    let auth_code = tokio::select! {
        result = server::handle_oauth_callback(listener, config.redirect_port) => result?,
        _ = close_rx => {
            return Err(anyhow::anyhow!("OAuth canceled: window was closed"));
        }
    };

    // Close the OAuth popup window (if it's still open)
    let _ = window.close();

    // Exchange authorization code for access token
    let token_result = client
        .exchange_code(auth_code)
        .set_pkce_verifier(pkce_verifier)
        .request_async(async_http_client)
        .await
        .context("Token exchange failed")?;

    let access_token = token_result.access_token();

    Ok(access_token.clone())
}
