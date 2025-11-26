mod migrations;
mod oauth;
mod routes;

use routes::oauth::{OAuthApi, OAuthApiImpl};
use taurpc::Router;

#[tokio::main]
pub async fn run() {
    let router = Router::new().merge(OAuthApiImpl.into_handler());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:rencal.db", migrations::get_migrations())
                .build(),
        )
        .invoke_handler(router.into_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
