mod google_oauth;
mod oauth;
mod routes;
mod storage;

// Re-export types for taurpc macro visibility
pub use storage::{Account, Calendar, Event, Provider};

use routes::providers::{Api, ApiImpl};

#[tokio::main]
pub async fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:rencal.db", storage::get_migrations())
                .build(),
        )
        .invoke_handler(taurpc::create_ipc_handler(ApiImpl.into_handler()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
