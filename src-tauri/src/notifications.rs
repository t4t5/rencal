//! In-process reminder loop.
//!
//! On Linux this only runs as a fallback when `rencal-notifierd` is not the
//! active reminder source — `lib.rs::setup` decides whether to spawn it.
//! macOS/Windows always run in-process. macOS uses mac-notification-sys
//! directly so notification clicks can be associated with their event;
//! Windows uses tauri-plugin-notification.
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
struct MacOsNotifier {
    app: AppHandle,
}

#[cfg(target_os = "macos")]
impl Notifier for MacOsNotifier {
    fn notify(&self, reminder: &ReminderNotification, icon: Option<&Path>) {
        let app = self.app.clone();
        let reminder = reminder.clone();
        let icon = icon.map(|path| path.to_string_lossy().into_owned());

        std::thread::spawn(move || {
            static APPLICATION_SET: std::sync::Once = std::sync::Once::new();
            APPLICATION_SET.call_once(|| {
                let identifier = if cfg!(debug_assertions) {
                    "com.apple.Terminal"
                } else {
                    app.config().identifier.as_str()
                };
                if let Err(error) = mac_notification_sys::set_application(identifier) {
                    log::warn!("failed to associate notifications with rencal: {error}");
                }
            });

            let mut notification = mac_notification_sys::Notification::new();
            notification
                .title(&reminder.title)
                .message(&reminder.body)
                .default_sound()
                .wait_for_click(true);
            if let Some(icon) = icon.as_deref() {
                notification.content_image(icon);
            }

            match notification.send() {
                Ok(mac_notification_sys::NotificationResponse::Click)
                | Ok(mac_notification_sys::NotificationResponse::ActionButton(_)) => {
                    super::deep_links::enqueue_urls(&app, &[reminder.event_url]);
                    super::focus_main_window(&app);
                }
                Ok(_) => {}
                Err(error) => log::warn!("show err: {error}"),
            }
        });
    }
}

pub async fn run_reminder_loop(app: AppHandle) {
    let icon = icon_path(&app);

    #[cfg(target_os = "macos")]
    {
        reminder_core::run_reminder_loop(MacOsNotifier { app }, icon).await;
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
