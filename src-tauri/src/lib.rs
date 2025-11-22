use tauri::{AppHandle, Runtime};

mod google_oauth;
mod oauth;
mod storage;

// Re-export types for taurpc macro visibility
pub use storage::{Calendar, OAuthProvider, Session};

#[taurpc::procedures(export_to = "../src/rpc/bindings.ts")]
trait Api {
    async fn greet(name: String) -> String;
    async fn google_oauth<R: Runtime>(app_handle: AppHandle<R>) -> Result<Session, String>;
    async fn refresh_google_token(refresh_token: String) -> Result<Session, String>;
    async fn fetch_google_calendars(access_token: String) -> Result<Vec<Calendar>, String>;
}

#[derive(Clone)]
struct ApiImpl;

#[taurpc::resolvers]
impl Api for ApiImpl {
    async fn greet(self, name: String) -> String {
        format!("Hello {}!", name)
    }

    async fn google_oauth<R: Runtime>(
        self,
        app: AppHandle<R>,
    ) -> Result<storage::Session, String> {
        let token_data = google_oauth::get_oauth_token(app.clone())
            .await
            .map_err(|e| e.to_string())?;

        Ok(storage::Session {
            access_token: token_data.access_token,
            refresh_token: token_data.refresh_token,
            expires_at: token_data.expires_at,
            provider: storage::OAuthProvider::Google,
            created_at: token_data.created_at,
        })
    }

    async fn refresh_google_token(self, refresh_token: String) -> Result<storage::Session, String> {
        let token_data = google_oauth::refresh_oauth_token(refresh_token.clone())
            .await
            .map_err(|e| e.to_string())?;

        Ok(storage::Session {
            access_token: token_data.access_token,
            // Keep the original refresh token if Google doesn't return a new one
            refresh_token: token_data.refresh_token.or(Some(refresh_token)),
            expires_at: token_data.expires_at,
            provider: storage::OAuthProvider::Google,
            created_at: token_data.created_at,
        })
    }

    async fn fetch_google_calendars(
        self,
        access_token: String,
    ) -> Result<Vec<storage::Calendar>, String> {
        // Use access token to fetch user's calendar list
        let client = reqwest::Client::new();
        let response = client
            .get("https://www.googleapis.com/calendar/v3/users/me/calendarList")
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch calendars: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Google Calendar API error: {}", response.status()));
        }

        let calendar_data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse calendar response: {}", e))?;

        // Parse calendars and extract data for storage
        let calendars = calendar_data["items"]
            .as_array()
            .ok_or("No calendars found")?
            .iter()
            .filter_map(|cal| {
                let id = cal["id"].as_str()?.to_string();
                let name = cal["summary"].as_str()?.to_string();
                let color = cal["backgroundColor"].as_str().map(|s| s.to_string());

                Some(Calendar {
                    id,
                    name,
                    color,
                    selected: true,
                })
            })
            .collect::<Vec<_>>();

        Ok(calendars)
    }
}

#[tokio::main]
pub async fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:sequence.db", storage::get_migrations())
                .build(),
        )
        .invoke_handler(taurpc::create_ipc_handler(ApiImpl.into_handler()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
