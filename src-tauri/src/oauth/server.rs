use anyhow::{anyhow, Context, Result};
use socket2::{Domain, Socket, Type};
use std::net::SocketAddr;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use url::Url;

pub struct OAuthCallbackParams {
    pub code: String,
    pub state: String,
}

const SUCCESS_RESPONSE: &str = r#"HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8

<!DOCTYPE html>
<html>
<head>
    <title>Authentication Successful</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
               display: flex; justify-content: center; align-items: center;
               height: 100vh; margin: 0; background: #f5f5f5; }
        .message { text-align: center; padding: 2rem; background: white;
                   border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        h1 { color: #4CAF50; margin: 0 0 1rem 0; }
    </style>
</head>
<body>
    <div class="message">
        <h1>✓ Authentication Successful</h1>
        <p>This window will close automatically...</p>
    </div>
</body>
</html>
"#;

/// Creates a localhost TCP listener on the specified port with SO_REUSEADDR enabled
///
/// SO_REUSEADDR allows immediate port rebinding, which is important for OAuth flows
/// where the user might cancel and retry quickly.
pub fn create_localhost_listener(port: u16) -> Result<TcpListener> {
    let bind_addr: SocketAddr = format!("127.0.0.1:{}", port)
        .parse()
        .context("Failed to parse bind address")?;

    // Create socket with SO_REUSEADDR to allow immediate rebinding
    let socket =
        Socket::new(Domain::IPV4, Type::STREAM, None).context("Failed to create socket")?;
    socket
        .set_reuse_address(true)
        .context("Failed to set SO_REUSEADDR")?;
    socket
        .set_nonblocking(true)
        .context("Failed to set non-blocking mode")?;
    socket
        .bind(&bind_addr.into())
        .with_context(|| format!("Failed to bind to {}", bind_addr))?;
    socket.listen(1).context("Failed to listen on socket")?;

    // Convert to async listener
    let std_listener: std::net::TcpListener = socket.into();
    let listener =
        TcpListener::from_std(std_listener).context("Failed to create async listener")?;

    Ok(listener)
}

/// Waits for OAuth callback, parses authorization code from HTTP request
/// 1. Accepts a single HTTP connection
/// 2. Reads the HTTP request line (e.g., "GET /callback?code=... HTTP/1.1")
/// 3. Sends a success HTML response to the browser
/// 4. Extracts and returns the authorization code from the URL
pub async fn handle_oauth_callback(listener: TcpListener, port: u16) -> Result<OAuthCallbackParams> {
    // Wait for the OAuth callback
    let (mut stream, _) = listener
        .accept()
        .await
        .context("Failed to accept connection")?;

    let mut reader = BufReader::new(&mut stream);
    let mut http_request = String::new();
    reader
        .read_line(&mut http_request)
        .await
        .context("Failed to read HTTP request")?;

    // Send success response to browser
    stream
        .write_all(SUCCESS_RESPONSE.as_bytes())
        .await
        .context("Failed to write HTTP response")?;
    stream
        .flush()
        .await
        .context("Failed to flush HTTP response")?;

    // Extract the authorization code from the callback URL
    let path = http_request
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| anyhow!("Invalid HTTP request format"))?;

    let callback_url = format!("http://localhost:{}{}", port, path);
    let url = Url::parse(&callback_url).context("Failed to parse callback URL")?;

    let code = url
        .query_pairs()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.to_string())
        .ok_or_else(|| anyhow!("Authorization code not found in callback URL"))?;

    let state = url
        .query_pairs()
        .find(|(key, _)| key == "state")
        .map(|(_, value)| value.to_string())
        .ok_or_else(|| anyhow!("State not found in callback URL"))?;

    Ok(OAuthCallbackParams { code, state })
}
