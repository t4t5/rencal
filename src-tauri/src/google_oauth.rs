use anyhow::{anyhow, Context, Result};
use oauth2::basic::BasicClient;
use oauth2::reqwest::async_http_client;
use oauth2::{
    AccessToken, AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge,
    RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use socket2::{Domain, Socket, Type};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Runtime};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
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

pub async fn get_access_token<R: Runtime>(app: AppHandle<R>) -> Result<AccessToken> {
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

    // Start HTTP server FIRST, before opening the popup
    // Use SO_REUSEADDR to allow immediate rebinding if port was recently used
    let bind_addr: SocketAddr = format!("127.0.0.1:{}", LOCAL_OAUTH_REDIRECT_PORT)
        .parse()
        .context("Failed to parse bind address")?;

    let socket = Socket::new(Domain::IPV4, Type::STREAM, None)
        .context("Failed to create socket")?;
    socket.set_reuse_address(true)
        .context("Failed to set SO_REUSEADDR")?;
    socket.set_nonblocking(true)
        .context("Failed to set non-blocking mode")?;
    socket.bind(&bind_addr.into())
        .with_context(|| format!("Failed to bind to {}", bind_addr))?;
    socket.listen(1)
        .context("Failed to listen on socket")?;

    let std_listener: std::net::TcpListener = socket.into();
    let listener = TcpListener::from_std(std_listener)
        .context("Failed to create async listener")?;

    // Create a channel to signal when the window is closed
    let (close_tx, close_rx) = tokio::sync::oneshot::channel();
    let close_tx = Arc::new(Mutex::new(Some(close_tx)));

    // Now create the popup window with Google OAuth page
    let window = tauri::WebviewWindowBuilder::new(
        &app,
        "google-oauth",
        tauri::WebviewUrl::External(auth_url.clone()),
    )
    .title("Sign in with Google")
    .inner_size(600.0, 700.0)
    .center()
    .resizable(false)
    .build()
    .context("Failed to create OAuth popup window")?;

    // Listen for window close event
    let close_tx_clone = close_tx.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            if let Ok(mut tx) = close_tx_clone.lock() {
                if let Some(sender) = tx.take() {
                    let _ = sender.send(());
                }
            }
        }
    });

    // Race between getting the OAuth callback and the window closing
    let auth_code = tokio::select! {
        result = async {
            // Wait for the OAuth callback
            let (mut stream, _) = listener.accept().await
                .context("Failed to accept connection")?;

            let mut reader = BufReader::new(&mut stream);
            let mut http_request = String::new();
            reader.read_line(&mut http_request).await
                .context("Failed to read HTTP request")?;

            // Send success response to browser
            stream.write_all(SUCCESS_RESPONSE.as_bytes()).await
                .context("Failed to write HTTP response")?;
            stream.flush().await
                .context("Failed to flush HTTP response")?;

            // Extract the authorization code from the callback URL
            let path = http_request
                .split_whitespace()
                .nth(1)
                .ok_or_else(|| anyhow!("Invalid HTTP request format"))?;

            let callback_url = format!("http://localhost:{}{}", LOCAL_OAUTH_REDIRECT_PORT, path);
            let url = Url::parse(&callback_url).context("Failed to parse callback URL")?;

            let code = url
                .query_pairs()
                .find(|(key, _)| key == "code")
                .map(|(_, value)| value.to_string())
                .ok_or_else(|| anyhow!("Authorization code not found in callback URL"))?;

            Ok::<AuthorizationCode, anyhow::Error>(AuthorizationCode::new(code))
        } => result?,
        _ = close_rx => {
            return Err(anyhow!("OAuth canceled: window was closed"));
        }
    };

    // Close the OAuth popup window (if it's still open)
    let _ = window.close();

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
