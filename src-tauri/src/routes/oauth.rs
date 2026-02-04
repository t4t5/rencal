use crate::routes::TauResult;
use tauri::{AppHandle, Manager, Runtime};

use crate::oauth;

const OAUTH_WINDOW_LABEL: &str = "oauth-popup";

#[taurpc::procedures(path = "oauth", export_to = "../src/rpc/bindings.ts")]
pub trait OAuthApi {
    async fn start_oauth_callback_server(port: u16) -> TauResult<String>;

    async fn open_oauth_window<R: Runtime>(
        app_handle: AppHandle<R>,
        url: String,
        title: String,
    ) -> TauResult<()>;

    async fn close_oauth_window<R: Runtime>(app_handle: AppHandle<R>) -> TauResult<()>;
}

#[derive(Clone)]
pub struct OAuthApiImpl;

#[taurpc::resolvers]
impl OAuthApi for OAuthApiImpl {
    async fn start_oauth_callback_server(self, port: u16) -> TauResult<String> {
        let listener = oauth::server::create_localhost_listener(port)
            .map_err(|e| format!("Failed to create OAuth callback server: {}", e))?;

        let auth_code = oauth::server::handle_oauth_callback(listener, port)
            .await
            .map_err(|e| format!("OAuth callback failed: {}", e))?;

        Ok(auth_code.secret().to_string())
    }

    async fn open_oauth_window<R: Runtime>(
        self,
        app: AppHandle<R>,
        url: String,
        title: String,
    ) -> TauResult<()> {
        let parsed_url = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

        // Just open the window and return immediately
        oauth::window::create_oauth_popup(&app, parsed_url, &title)
            .map_err(|e| format!("Failed to create OAuth popup: {}", e))?;

        Ok(())
    }

    async fn close_oauth_window<R: Runtime>(self, app: AppHandle<R>) -> TauResult<()> {
        if let Some(window) = app.get_webview_window(OAUTH_WINDOW_LABEL) {
            window
                .close()
                .map_err(|e| format!("Failed to close OAuth window: {}", e))?;
        }
        Ok(())
    }
}
