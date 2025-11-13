use anyhow::{anyhow, Context, Result};
use oauth2::basic::BasicClient;
use oauth2::reqwest::async_http_client;
use oauth2::{
    AccessToken, AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge,
    RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use url::Url;

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

// Sequence desktop app credentials:
const APP_CLIENT_ID: &str =
    "988213795701-e04kh9dmf8dl8cjp1lour13g7fpp0cpp.apps.googleusercontent.com";
const APP_CLIENT_SECRET: &str = "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";

// Google OAuth redirect (on localhost)
const LOCAL_OAUTH_REDIRECT_PORT: u16 = 8080;

// HTTP response shown after successful OAuth callback
const SUCCESS_RESPONSE: &str = "\
HTTP/1.1 200 OK\r\n\
Content-Type: text/html\r\n\
\r\n\
<html>\
<body>\
<h1>Authentication successful!</h1>\
<p>You can close this window and return to the app.</p>\
</body>\
</html>";

fn create_google_oauth_client() -> Result<BasicClient> {
    let client_id = ClientId::new(APP_CLIENT_ID.to_string());
    let client_secret = ClientSecret::new(APP_CLIENT_SECRET.to_string());

    let auth_url = AuthUrl::new(GOOGLE_AUTH_URL.to_string()).context("Failed to parse auth URL")?;

    let token_url =
        TokenUrl::new(GOOGLE_TOKEN_URL.to_string()).context("Failed to parse token URL")?;

    let redirect_url = format!("http://localhost:{}", LOCAL_OAUTH_REDIRECT_PORT);
    let redirect_url = RedirectUrl::new(redirect_url).context("Failed to parse redirect URL")?;

    Ok(
        BasicClient::new(client_id, Some(client_secret), auth_url, Some(token_url))
            .set_redirect_uri(redirect_url),
    )
}

// Start a temporary HTTP server to receive the OAuth callback
fn handle_oauth_redirect() -> Result<AuthorizationCode> {
    let bind_addr = format!("127.0.0.1:{}", LOCAL_OAUTH_REDIRECT_PORT);

    let listener = TcpListener::bind(&bind_addr)
        .with_context(|| format!("Failed to bind to {}", bind_addr))?;

    let (mut stream, _) = listener.accept().context("Failed to accept connection")?;

    let mut reader = BufReader::new(&stream);
    let mut http_request = String::new();
    reader
        .read_line(&mut http_request)
        .context("Failed to read HTTP request")?;

    // Send success response to browser
    stream
        .write_all(SUCCESS_RESPONSE.as_bytes())
        .and_then(|_| stream.flush())
        .context("Failed to send HTTP response")?;

    // Extract the path from the request
    // (second token in "GET /path HTTP/1.1")
    let path = http_request
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| anyhow!("Invalid HTTP request format"))?;

    // Parse the callback URL to extract authorization code
    let callback_url = format!("http://localhost:{}{}", LOCAL_OAUTH_REDIRECT_PORT, path);
    let url = Url::parse(&callback_url).context("Failed to parse callback URL")?;

    let code = url
        .query_pairs()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.to_string())
        .ok_or_else(|| anyhow!("Authorization code not found in callback URL"))?;

    Ok(AuthorizationCode::new(code))
}

pub async fn get_access_token() -> Result<AccessToken> {
    let client = create_google_oauth_client()?;

    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    // Generate authorization URL with calendar read-only scope
    let (auth_url, _csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .set_pkce_challenge(pkce_challenge)
        .add_scope(Scope::new(
            "https://www.googleapis.com/auth/calendar.readonly".to_string(),
        ))
        .url();

    // Open the authorization URL in the user's browser
    open::that(auth_url.as_str()).context("Failed to open browser")?;

    // Receive the OAuth callback from the browser
    let auth_code = handle_oauth_redirect()?;

    // Exchange the authorization code for an access token
    let token_result = client
        .exchange_code(auth_code)
        .set_pkce_verifier(pkce_verifier)
        .request_async(async_http_client)
        .await
        .context("Token exchange failed")?;

    let access_token = token_result.access_token();

    Ok(access_token.clone())
}
