use anyhow::Result;
use oauth2::AccessToken;
use tauri::{AppHandle, Runtime};

use crate::oauth::{handle_oauth, OAuthConfig};

// Google OAuth endpoints
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

// Sequence desktop app credentials
// Note: These are embedded in the app (standard for desktop apps like Thunderbird).
// PKCE provides security against token theft, not the client secret.
const APP_CLIENT_ID: &str =
    "988213795701-e04kh9dmf8dl8cjp1lour13g7fpp0cpp.apps.googleusercontent.com";
const APP_CLIENT_SECRET: &str = "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";

// Google OAuth redirect (on localhost)
const LOCAL_OAUTH_REDIRECT_PORT: u16 = 8080;

/// Performs Google Calendar OAuth 2.0 authentication flow
///
/// Opens a popup window with Google's OAuth consent page, waits for authorization,
/// and exchanges the code for an access token with calendar.readonly scope.
///
/// Returns an error if the user closes the window or if authentication fails.
pub async fn get_access_token<R: Runtime>(app: AppHandle<R>) -> Result<AccessToken> {
    let config = OAuthConfig {
        client_id: APP_CLIENT_ID.to_string(),
        client_secret: APP_CLIENT_SECRET.to_string(),
        auth_url: GOOGLE_AUTH_URL.to_string(),
        token_url: GOOGLE_TOKEN_URL.to_string(),
        redirect_port: LOCAL_OAUTH_REDIRECT_PORT,
        scopes: vec!["https://www.googleapis.com/auth/calendar.readonly".to_string()],
        window_title: "Sign in with Google".to_string(),
    };

    handle_oauth(app, config).await
}
