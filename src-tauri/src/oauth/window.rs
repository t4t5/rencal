use anyhow::{Context, Result};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Runtime, WebviewWindow};
use tokio::sync::oneshot;
use url::Url;

/// Creates an OAuth popup window and sets up close detection
pub fn create_oauth_popup<R: Runtime>(
    app: &AppHandle<R>,
    auth_url: Url,
    window_title: &str,
) -> Result<(WebviewWindow<R>, oneshot::Receiver<()>)> {
    // Create a channel to signal when the window is closed
    let (close_tx, close_rx) = oneshot::channel();
    let close_tx = Arc::new(Mutex::new(Some(close_tx)));

    // Create the popup window with OAuth provider's page
    let window =
        tauri::WebviewWindowBuilder::new(app, "oauth-popup", tauri::WebviewUrl::External(auth_url))
            .title(window_title)
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

    Ok((window, close_rx))
}
