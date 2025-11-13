use oauth2::basic::BasicClient;
use oauth2::reqwest::async_http_client;
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge,
    PkceCodeVerifier, RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use url::Url;

// Google OAuth endpoints
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

// Temporary test credentials - For production, you should create your own
// Google Cloud project and replace these with your own Client ID/Secret
const CLIENT_ID: &str = "988213795701-e04kh9dmf8dl8cjp1lour13g7fpp0cpp.apps.googleusercontent.com";
const CLIENT_SECRET: &str = "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";

// Localhost redirect for OAuth
const REDIRECT_URL: &str = "http://localhost:8080";

pub struct GoogleOAuthFlow {
    client: BasicClient,
    pkce_verifier: PkceCodeVerifier,
    pkce_challenge: PkceCodeChallenge,
}

impl GoogleOAuthFlow {
    pub fn new() -> Result<Self, String> {
        let client = BasicClient::new(
            ClientId::new(CLIENT_ID.to_string()),
            Some(ClientSecret::new(CLIENT_SECRET.to_string())),
            AuthUrl::new(AUTH_URL.to_string()).map_err(|e| e.to_string())?,
            Some(TokenUrl::new(TOKEN_URL.to_string()).map_err(|e| e.to_string())?),
        )
        .set_redirect_uri(RedirectUrl::new(REDIRECT_URL.to_string()).map_err(|e| e.to_string())?);

        // Generate PKCE challenge for security
        let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

        Ok(Self {
            client,
            pkce_verifier,
            pkce_challenge,
        })
    }

    pub fn get_auth_url(&self) -> (String, CsrfToken) {
        let (auth_url, csrf_token) = self
            .client
            .authorize_url(CsrfToken::new_random)
            .add_scope(Scope::new(
                "https://www.googleapis.com/auth/calendar.readonly".to_string(),
            ))
            .set_pkce_challenge(self.pkce_challenge.clone())
            .url();

        (auth_url.to_string(), csrf_token)
    }

    pub async fn exchange_code(self, code: String) -> Result<String, String> {
        let token_result = self
            .client
            .exchange_code(AuthorizationCode::new(code))
            .set_pkce_verifier(self.pkce_verifier)
            .request_async(async_http_client)
            .await
            .map_err(|e| format!("Failed to exchange code: {}", e))?;

        Ok(token_result.access_token().secret().clone())
    }
}

pub async fn run_oauth_flow() -> Result<String, String> {
    // Create OAuth client
    let oauth = GoogleOAuthFlow::new()?;
    let (auth_url, csrf_token) = oauth.get_auth_url();

    println!("Opening browser for authentication...");
    println!("Auth URL: {}", auth_url);

    // Open the authorization URL in the user's browser
    if let Err(e) = open::that(&auth_url) {
        return Err(format!("Failed to open browser: {}", e));
    }

    // Start a temporary HTTP server to receive the OAuth callback
    let listener = TcpListener::bind("127.0.0.1:8080")
        .map_err(|e| format!("Failed to bind to localhost:8080: {}", e))?;

    println!("Waiting for OAuth callback on localhost:8080...");

    // Wait for a single connection
    let (mut stream, _) = listener
        .accept()
        .map_err(|e| format!("Failed to accept connection: {}", e))?;

    // Read the HTTP request
    let mut reader = BufReader::new(&stream);
    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .map_err(|e| format!("Failed to read request: {}", e))?;

    // Send a simple success response to the browser
    let response = "HTTP/1.1 200 OK\r\n\r\n<html><body><h1>Authentication successful!</h1><p>You can close this window and return to the app.</p></body></html>";
    stream
        .write_all(response.as_bytes())
        .map_err(|e| format!("Failed to write response: {}", e))?;
    stream
        .flush()
        .map_err(|e| format!("Failed to flush response: {}", e))?;

    // Parse the callback URL to extract the authorization code
    let redirect_url = request_line
        .split_whitespace()
        .nth(1)
        .ok_or("Invalid request format")?;
    let full_url = format!("http://localhost:8080{}", redirect_url);
    let url = Url::parse(&full_url).map_err(|e| format!("Failed to parse URL: {}", e))?;

    // Extract authorization code and state from query parameters
    let code = url
        .query_pairs()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.to_string())
        .ok_or("No authorization code in callback")?;

    let state = url
        .query_pairs()
        .find(|(key, _)| key == "state")
        .map(|(_, value)| value.to_string())
        .ok_or("No state in callback")?;

    // Verify CSRF token
    if state != *csrf_token.secret() {
        return Err("CSRF token mismatch".to_string());
    }

    println!("Authorization code received, exchanging for access token...");

    // Exchange the authorization code for an access token
    let access_token = oauth.exchange_code(code).await?;

    println!("Access token obtained successfully!");

    Ok(access_token)
}
