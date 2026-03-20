mod notifications;
mod oauth;
mod routes;

use routes::caldir::{CaldirApi, CaldirApiImpl};
use taurpc::Router;

/// Creates the taurpc router. Exposed for type generation.
pub fn create_router() -> Router<tauri::Wry> {
    Router::new().merge(CaldirApiImpl.into_handler())
}

#[tokio::main]
pub async fn run() {
    let router = create_router();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            tokio::spawn(notifications::run_reminder_loop(app.handle().clone()));
            Ok(())
        })
        .invoke_handler(router.into_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
