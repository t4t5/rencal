mod google_oauth;

#[taurpc::procedures(export_to = "../src/rpc/bindings.ts")]
trait Api {
    async fn greet(name: String) -> String;
    async fn start_google_oauth() -> Result<String, String>;
}

#[derive(Clone)]
struct ApiImpl;

#[taurpc::resolvers]
impl Api for ApiImpl {
    async fn greet(self, name: String) -> String {
        format!("Hello {}!", name)
    }

    async fn start_google_oauth(self) -> Result<String, String> {
        // Run the OAuth flow to get an access token
        let access_token = google_oauth::run_oauth_flow().await?;

        // Use the access token to fetch the user's calendar list
        let client = reqwest::Client::new();
        let response = client
            .get("https://www.googleapis.com/calendar/v3/users/me/calendarList")
            .bearer_auth(&access_token)
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

        // Extract calendar names for display
        let calendars = calendar_data["items"]
            .as_array()
            .ok_or("No calendars found")?
            .iter()
            .filter_map(|cal| cal["summary"].as_str().map(|s| s.to_string()))
            .collect::<Vec<_>>();

        Ok(format!(
            "Connected! Found {} calendars:\n{}",
            calendars.len(),
            calendars.join("\n")
        ))
    }
}

#[tokio::main]
pub async fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(taurpc::create_ipc_handler(ApiImpl.into_handler()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
