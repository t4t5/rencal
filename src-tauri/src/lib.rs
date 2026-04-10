mod notifications;
mod oauth;
mod routes;

use routes::caldir::{CaldirApi, CaldirApiImpl};
use tauri::Manager;
use taurpc::Router;

/// Creates the taurpc router. Exposed for type generation.
pub fn create_router() -> Router<tauri::Wry> {
    Router::new().merge(CaldirApiImpl.into_handler())
}

/// Resolve the bundled providers directory and set `CALDIR_PROVIDER_PATH`.
fn setup_bundled_providers(app: &tauri::App) {
    let providers_dir = if cfg!(debug_assertions) {
        // In dev mode, Tauri doesn't copy resources — use the build output directly.
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("providers")
    } else {
        app.path()
            .resolve("providers", tauri::path::BaseDirectory::Resource)
            .expect("failed to resolve bundled providers directory")
    };

    // Ensure bundled binaries are executable (unix only).
    #[cfg(unix)]
    if let Ok(entries) = std::fs::read_dir(&providers_dir) {
        use std::os::unix::fs::PermissionsExt;
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                let mut perms = metadata.permissions();
                perms.set_mode(perms.mode() | 0o111);
                let _ = std::fs::set_permissions(entry.path(), perms);
            }
        }
    }

    std::env::set_var("CALDIR_PROVIDER_PATH", &providers_dir);
}

#[tokio::main]
pub async fn run() {
    let router = create_router();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            setup_bundled_providers(app);
            tokio::spawn(notifications::run_reminder_loop(app.handle().clone()));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Hide the window instead of closing it so the app keeps
                // running in the background (e.g. for notifications).
                // The app only quits on an explicit quit action.
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(router.into_handler())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { has_visible_windows, .. } = event {
                if !has_visible_windows {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        });
}
