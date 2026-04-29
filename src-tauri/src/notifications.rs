//! In-process reminder loop.
//!
//! On Linux this only runs as a fallback when `rencal-notifierd` is not the
//! active reminder source — `lib.rs::setup` decides whether to spawn it.
//! macOS/Windows always run in-process via tauri-plugin-notification.
//! See `docs/notifications.md` for the design.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};
#[cfg(not(target_os = "linux"))]
use {reminder_core::Notifier, std::path::Path, tauri_plugin_notification::NotificationExt};

#[cfg(not(target_os = "linux"))]
struct TauriNotifier {
    app: AppHandle,
}

#[cfg(not(target_os = "linux"))]
impl Notifier for TauriNotifier {
    fn notify(&self, title: &str, body: &str, icon: Option<&Path>) {
        let app = self.app.clone();
        let title = title.to_string();
        let body = body.to_string();
        let icon = icon.map(|p| p.to_string_lossy().into_owned());
        std::thread::spawn(move || {
            let mut builder = app
                .notification()
                .builder()
                .title(&title)
                .body(&body)
                .sound("default");
            if let Some(icon) = icon {
                builder = builder.icon(icon);
            }
            if let Err(e) = builder.show() {
                log::warn!("show err: {e}");
            }
        });
    }
}

pub async fn run_reminder_loop(app: AppHandle) {
    let icon = icon_path(&app);

    #[cfg(not(target_os = "linux"))]
    {
        reminder_core::run_reminder_loop(TauriNotifier { app }, icon).await;
    }

    #[cfg(target_os = "linux")]
    {
        let _ = app;
        reminder_core::run_reminder_loop(reminder_core::NotifySendNotifier, icon).await;
    }
}

fn icon_path(app: &AppHandle) -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        Some(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons/128x128.png"))
    } else {
        app.path()
            .resolve("icons/128x128.png", tauri::path::BaseDirectory::Resource)
            .ok()
    }
}
