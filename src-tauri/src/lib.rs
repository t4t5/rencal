mod caldir_watcher;
mod notifications;
mod oauth;
mod omarchy;
mod routes;

use routes::caldir::{CaldirApi, CaldirApiImpl};
use routes::omarchy::{OmarchyApi, OmarchyApiImpl};
use routes::platform::{needs_native_decorations, PlatformApi, PlatformApiImpl};
use tauri::Manager;
use taurpc::Router;

const MIN_WINDOW_WIDTH: f64 = 300.0;
const MIN_WINDOW_HEIGHT: f64 = 600.0;

/// Creates the taurpc router. Exposed for type generation.
pub fn create_router() -> Router<tauri::Wry> {
    Router::new()
        .merge(CaldirApiImpl.into_handler())
        .merge(OmarchyApiImpl.into_handler())
        .merge(PlatformApiImpl.into_handler())
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
    // Force a dark GTK theme so the native titlebar drawn by the WM/compositor
    // matches the app's dark UI instead of the user's (usually light) system theme.
    // Must be set before GTK initializes, hence at the very top of run().
    #[cfg(target_os = "linux")]
    if needs_native_decorations() {
        std::env::set_var("GTK_THEME", "Adwaita:dark");
    }

    let router = create_router();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            setup_bundled_providers(app);
            tokio::spawn(notifications::run_reminder_loop(app.handle().clone()));
            tokio::spawn(omarchy::run_watcher(app.handle().clone()));
            tokio::spawn(caldir_watcher::run_watcher(app.handle().clone()));
            if let Some(window) = app.get_webview_window("main") {
                if needs_native_decorations() {
                    let _ = window.set_decorations(true);
                    // Windows: trigger DWM immersive dark mode on the titlebar.
                    // (GTK dark theme is handled via GTK_THEME above.)
                    #[cfg(target_os = "windows")]
                    let _ = window.set_theme(Some(tauri::Theme::Dark));
                }
                let _ = window.set_min_size(Some(tauri::LogicalSize::new(
                    MIN_WINDOW_WIDTH,
                    MIN_WINDOW_HEIGHT,
                )));
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Hide the main window instead of closing it so the app keeps
                // running in the background (e.g. for notifications).
                // Only applied where no visible close button exists — on
                // stacking WMs the user expects clicking X to actually quit.
                if window.label() == "main" && !needs_native_decorations() {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(router.into_handler())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen {
                has_visible_windows,
                ..
            } = _event
            {
                if !has_visible_windows {
                    if let Some(window) = _app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        });
}
