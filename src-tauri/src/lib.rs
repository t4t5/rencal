use tauri::{AppHandle, Runtime};
use uuid::Uuid;

mod google_oauth;
mod oauth;
mod storage;

// Re-export types for taurpc macro visibility
pub use storage::{Calendar, Event, OAuthProvider, Session};

/// Result of a sync operation - contains events to upsert, IDs to delete, and new sync token
#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct SyncResult {
    pub events: Vec<Event>,
    pub deleted_event_ids: Vec<String>,
    pub sync_token: Option<String>,
    pub full_sync_required: bool,
}

#[taurpc::procedures(export_to = "../src/rpc/bindings.ts")]
trait Api {
    async fn google_oauth<R: Runtime>(app_handle: AppHandle<R>) -> Result<Session, String>;
    async fn refresh_google_token(refresh_token: String) -> Result<Session, String>;
    async fn fetch_google_calendars(access_token: String) -> Result<Vec<Calendar>, String>;
    async fn sync_google_events(
        access_token: String,
        google_calendar_id: String,
        calendar_id: String,
        sync_token: Option<String>,
    ) -> Result<SyncResult, String>;
}

#[derive(Clone)]
struct ApiImpl;

#[taurpc::resolvers]
impl Api for ApiImpl {
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
                let google_calendar_id = cal["id"].as_str()?.to_string();
                let name = cal["summary"].as_str()?.to_string();
                let color = cal["backgroundColor"].as_str().map(|s| s.to_string());

                Some(Calendar {
                    id: Uuid::new_v4().to_string(),
                    google_calendar_id: Some(google_calendar_id),
                    name,
                    color,
                    selected: true,
                    sync_token: None,
                    last_synced_at: None,
                })
            })
            .collect::<Vec<_>>();

        Ok(calendars)
    }

    async fn sync_google_events(
        self,
        access_token: String,
        google_calendar_id: String,
        calendar_id: String,
        sync_token: Option<String>,
    ) -> Result<SyncResult, String> {
        let client = reqwest::Client::new();
        let url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/{}/events",
            urlencoding::encode(&google_calendar_id)
        );

        // Build query parameters based on whether we have a sync token
        let mut query_params: Vec<(&str, String)> = vec![];

        if let Some(ref token) = sync_token {
            // Incremental sync - just send the sync token
            query_params.push(("syncToken", token.clone()));
        } else {
            // Full sync - fetch events from 1 year ago to 1 year ahead
            let now = chrono::Utc::now();
            let time_min = (now - chrono::Duration::days(365)).to_rfc3339();
            let time_max = (now + chrono::Duration::days(365)).to_rfc3339();
            query_params.push(("timeMin", time_min));
            query_params.push(("timeMax", time_max));
            query_params.push(("singleEvents", "true".to_string()));
        }

        let response = client
            .get(&url)
            .bearer_auth(&access_token)
            .query(&query_params)
            .send()
            .await
            .map_err(|e| format!("Failed to sync events: {}", e))?;

        let status = response.status();

        // Handle 410 Gone - sync token expired, need full sync
        if status == reqwest::StatusCode::GONE {
            return Ok(SyncResult {
                events: vec![],
                deleted_event_ids: vec![],
                sync_token: None,
                full_sync_required: true,
            });
        }

        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Google Calendar API error: {} - {}", status, body));
        }

        let events_data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse sync response: {}", e))?;

        let mut events = Vec::new();
        let mut deleted_event_ids = Vec::new();

        // Parse events from response
        if let Some(items) = events_data["items"].as_array() {
            for event in items {
                let google_event_id = match event["id"].as_str() {
                    Some(id) => id.to_string(),
                    None => continue,
                };

                // Check if event was deleted (cancelled)
                if event["status"].as_str() == Some("cancelled") {
                    deleted_event_ids.push(google_event_id);
                    continue;
                }

                let summary = event["summary"].as_str().unwrap_or("(No title)").to_string();
                let updated_at = event["updated"].as_str().map(|s| s.to_string());

                // Handle all-day events (date) vs timed events (dateTime)
                let (start, all_day) = if let Some(date) = event["start"]["date"].as_str() {
                    (date.to_string(), true)
                } else if let Some(datetime) = event["start"]["dateTime"].as_str() {
                    (datetime.to_string(), false)
                } else {
                    continue;
                };

                let end = if let Some(date) = event["end"]["date"].as_str() {
                    date.to_string()
                } else if let Some(datetime) = event["end"]["dateTime"].as_str() {
                    datetime.to_string()
                } else {
                    continue;
                };

                events.push(storage::Event {
                    id: Uuid::new_v4().to_string(),
                    google_event_id: Some(google_event_id),
                    calendar_id: calendar_id.clone(),
                    summary,
                    start,
                    end,
                    all_day,
                    updated_at,
                });
            }
        }

        // Extract new sync token for next incremental sync
        let new_sync_token = events_data["nextSyncToken"]
            .as_str()
            .map(|s| s.to_string());

        Ok(SyncResult {
            events,
            deleted_event_ids,
            sync_token: new_sync_token,
            full_sync_required: false,
        })
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
