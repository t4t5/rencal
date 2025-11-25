use anyhow::{Context, Result};
use tauri::{AppHandle, Runtime};

use crate::oauth::{handle_oauth, refresh_access_token, OAuthConfig, RefreshConfig, SessionData};

// Google OAuth endpoints
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v2/userinfo";

// Rencal desktop app credentials
// Note: These are embedded in the app (standard for desktop apps like Thunderbird).
// PKCE provides security against token theft, not the client secret.
const APP_CLIENT_ID: &str =
    "988213795701-e04kh9dmf8dl8cjp1lour13g7fpp0cpp.apps.googleusercontent.com";
const APP_CLIENT_SECRET: &str = "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";

// Google OAuth redirect (on localhost)
const LOCAL_OAUTH_REDIRECT_PORT: u16 = 8080;

/// Fetches the user's email from Google's userinfo endpoint
async fn fetch_google_email(access_token: &str) -> Result<Option<String>> {
    let client = reqwest::Client::new();
    let response = client
        .get(GOOGLE_USERINFO_URL)
        .bearer_auth(access_token)
        .send()
        .await
        .context("Failed to fetch user info")?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let user_info: serde_json::Value =
        response.json().await.context("Failed to parse user info")?;

    Ok(user_info["email"].as_str().map(|s| s.to_string()))
}

/// Performs Google Calendar OAuth 2.0 authentication flow
///
/// Opens a popup window with Google's OAuth consent page, waits for authorization,
/// and exchanges the code for access token and refresh token with calendar.readonly scope.
///
/// Returns an error if the user closes the window or if authentication fails.
pub async fn get_oauth_token<R: Runtime>(app: AppHandle<R>) -> Result<SessionData> {
    let config = OAuthConfig {
        client_id: APP_CLIENT_ID.to_string(),
        client_secret: APP_CLIENT_SECRET.to_string(),
        auth_url: GOOGLE_AUTH_URL.to_string(),
        token_url: GOOGLE_TOKEN_URL.to_string(),
        redirect_port: LOCAL_OAUTH_REDIRECT_PORT,
        scopes: vec![
            "https://www.googleapis.com/auth/calendar.readonly".to_string(),
            "https://www.googleapis.com/auth/userinfo.email".to_string(),
        ],
        window_title: "Sign in with Google".to_string(),
        extra_params: vec![
            ("access_type".to_string(), "offline".to_string()),
            ("prompt".to_string(), "consent".to_string()),
        ],
    };

    let mut session_data = handle_oauth(app, config).await?;

    // Fetch the user's email
    session_data.email = fetch_google_email(&session_data.access_token).await?;

    Ok(session_data)
}

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
