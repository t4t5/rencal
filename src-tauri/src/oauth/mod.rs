pub mod server;
pub mod window;

use anyhow::{Context, Result};
use oauth2::basic::BasicClient;
use oauth2::reqwest::async_http_client;
use oauth2::{AuthUrl, ClientId, ClientSecret, RefreshToken, TokenResponse, TokenUrl};
use std::time::{SystemTime, UNIX_EPOCH};

/// OAuth token response data
pub struct SessionData {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: i64,
    pub created_at: i64,
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
