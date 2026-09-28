//! In-process reminder loop.
//!
//! On Linux this only runs as a fallback when `rencal-notifierd` is not the
//! active reminder source — `lib.rs::setup` decides whether to spawn it.
//! macOS/Windows always run in-process. macOS posts through
//! `UNUserNotificationCenter` (`macos_notifications.rs`), whose delegate opens
//! the clicked reminder's event; Windows uses tauri-plugin-notification.
//! See `docs/notifications.md` for the design.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};
#[cfg(target_os = "windows")]
use tauri_plugin_notification::NotificationExt;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use {reminder_core::Notifier, reminder_core::ReminderNotification, std::path::Path};

#[cfg(target_os = "windows")]
struct TauriNotifier {
    app: AppHandle,
}

#[cfg(target_os = "windows")]
impl Notifier for TauriNotifier {
    fn notify(&self, notification: &ReminderNotification, icon: Option<&Path>) {
        let app = self.app.clone();
        let notification = notification.clone();
        let icon = icon.map(|p| p.to_string_lossy().into_owned());
        std::thread::spawn(move || {
            let mut builder = app
                .notification()
                .builder()
                .title(&notification.title)
                .body(&notification.body)
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

#[cfg(target_os = "macos")]
struct MacOsNotifier;

#[cfg(target_os = "macos")]
impl Notifier for MacOsNotifier {
    // A bundled app's notifications already carry the app icon.
    fn notify(&self, reminder: &ReminderNotification, _icon: Option<&Path>) {
        crate::macos_notifications::post(reminder);
    }
}

pub async fn run_reminder_loop(app: AppHandle) {
    let icon = icon_path(&app);

    #[cfg(target_os = "macos")]
    {
        let _ = app;
        reminder_core::run_reminder_loop(MacOsNotifier, icon).await;
    }

    #[cfg(target_os = "windows")]
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
