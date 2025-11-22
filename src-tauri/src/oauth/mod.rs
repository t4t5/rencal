mod server;
mod window;

use anyhow::{Context, Result};
use oauth2::basic::BasicClient;
use oauth2::reqwest::async_http_client;
use oauth2::{
    AuthUrl, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge, RedirectUrl, RefreshToken,
    Scope, TokenResponse, TokenUrl,
};
use std::time::{SystemTime, UNIX_EPOCH};
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
    pub extra_params: Vec<(String, String)>,
}

/// OAuth token response data
pub struct SessionData {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: i64,
    pub created_at: i64,
}

/// Runs a complete OAuth 2.0 PKCE flow with popup window and localhost callback
/// 1. Creates a localhost HTTP server for OAuth callback
/// 2. Opens a popup window with the OAuth provider's authorization page
/// 3. Waits for either callback success or window close (cancellation)
/// 4. Exchanges authorization code for access token and refresh token
pub async fn handle_oauth<R: Runtime>(
    app: AppHandle<R>,
    config: OAuthConfig,
) -> Result<SessionData> {
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

    // Add extra parameters (e.g., access_type=offline for Google)
    for (key, value) in config.extra_params {
        auth_url_builder = auth_url_builder.add_extra_param(key, value);
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

    // Extract token data
    let access_token = token_result.access_token().secret().to_string();
    let refresh_token = token_result.refresh_token().map(|t| t.secret().to_string());

    // Calculate expiry time
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("Failed to get current time")?
        .as_secs() as i64;

    let expires_at = if let Some(expires_in) = token_result.expires_in() {
        now + expires_in.as_secs() as i64
    } else {
        // Default to 1 hour if not provided
        now + 3600
    };

    Ok(SessionData {
        access_token,
        refresh_token,
        expires_at,
        created_at: now,
    })
}

/// Configuration for refreshing an OAuth 2.0 token
pub struct RefreshConfig {
    pub client_id: String,
    pub client_secret: String,
    pub token_url: String,
    pub refresh_token: String,
}

/// Refreshes an OAuth 2.0 access token using a refresh token
pub async fn refresh_access_token(config: RefreshConfig) -> Result<SessionData> {
    let client = BasicClient::new(
        ClientId::new(config.client_id),
        Some(ClientSecret::new(config.client_secret)),
        // Auth URL not needed for refresh, but required by the client
        AuthUrl::new("https://unused.example.com".to_string())?,
        Some(TokenUrl::new(config.token_url).context("Invalid token URL")?),
    );

    let token_result = client
        .exchange_refresh_token(&RefreshToken::new(config.refresh_token))
        .request_async(async_http_client)
        .await
        .context("Token refresh failed")?;

    let access_token = token_result.access_token().secret().to_string();
    // Google typically doesn't return a new refresh token on refresh, so we keep the old one
    let refresh_token = token_result.refresh_token().map(|t| t.secret().to_string());

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("Failed to get current time")?
        .as_secs() as i64;

    let expires_at = if let Some(expires_in) = token_result.expires_in() {
        now + expires_in.as_secs() as i64
    } else {
        // Default to 1 hour if not provided
        now + 3600
    };

    Ok(SessionData {
        access_token,
        refresh_token,
        expires_at,
        created_at: now,
    })
}
