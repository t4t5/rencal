mod oauth;
mod routes;
mod storage;

// Re-export types for taurpc macro visibility
pub use storage::{Account, Calendar, Event, Provider};

use routes::oauth::{OAuthApi, OAuthApiImpl};
use routes::providers::google::{Api, ApiImpl};
use taurpc::Router;

#[tokio::main]
pub async fn run() {
    let router = Router::new()
        .merge(ApiImpl.into_handler())
        .merge(OAuthApiImpl.into_handler());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:rencal.db", storage::get_migrations())
                .build(),
        )
        .invoke_handler(router.into_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
