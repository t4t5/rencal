use anyhow::Result;

use crate::oauth::{refresh_access_token, RefreshConfig, SessionData};

const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

const APP_CLIENT_ID: &str =
    "988213795701-e04kh9dmf8dl8cjp1lour13g7fpp0cpp.apps.googleusercontent.com";
const APP_CLIENT_SECRET: &str = "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";

/// Refreshes a Google OAuth access token using a refresh token
pub async fn refresh_oauth_token(refresh_token: String) -> Result<SessionData> {
    let config = RefreshConfig {
        client_id: APP_CLIENT_ID.to_string(),
        client_secret: APP_CLIENT_SECRET.to_string(),
        token_url: GOOGLE_TOKEN_URL.to_string(),
        refresh_token,
    };

    refresh_access_token(config).await
}
