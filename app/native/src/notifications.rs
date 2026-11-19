//! In-process reminder loop.
//!
//! On Linux this only runs as a fallback when `rencal-notifierd` is not the
//! active reminder source — `lib.rs::setup` decides whether to spawn it.
//! macOS/Windows always run in-process. macOS posts through
//! `UNUserNotificationCenter` (`macos_notifications.rs`), whose delegate opens
//! the clicked reminder's event. Windows has no notifier yet: reminders are logged.
//! See `docs/notifications.md` for the design.

use std::path::PathBuf;

use crate::host::AppHandle;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use {reminder_core::Notifier, reminder_core::ReminderNotification, std::path::Path};

#[cfg(target_os = "windows")]
struct LogNotifier;

#[cfg(target_os = "windows")]
impl Notifier for LogNotifier {
    fn notify(&self, notification: &ReminderNotification, _icon: Option<&Path>) {
        log::warn!(
            "reminder not shown (no Windows notifier): {}",
            notification.title
        );
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
    let icon = icon_path();

    #[cfg(target_os = "macos")]
    {
        let _ = app;
        reminder_core::run_reminder_loop(MacOsNotifier, icon).await;
    }

    #[cfg(target_os = "windows")]
    {
        let _ = app;
        reminder_core::run_reminder_loop(LogNotifier, icon).await;
    }

    #[cfg(target_os = "linux")]
    {
        let _ = app;
        reminder_core::run_reminder_loop(reminder_core::NotifySendNotifier, icon).await;
    }
}

fn icon_path() -> Option<PathBuf> {
    #[cfg(debug_assertions)]
    return Some(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons/128x128.png"));
    #[cfg(not(debug_assertions))]
    std::env::current_exe()
        .ok()?
        .parent()
        .map(|dir| dir.join("icons/128x128.png"))
}
