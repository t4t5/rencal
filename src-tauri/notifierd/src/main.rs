//! Standalone reminder daemon.
//!
//! Runs the same reminder loop as the rencal GUI, but as a long-lived
//! systemd-managed user service. Reminders fire even when the GUI is closed
//! (or never launched), and on stacking WMs (GNOME/KDE) where closing the
//! rencal window quits the process. The GUI on Linux skips its in-process
//! loop when this daemon is active to avoid duplicate notifications.
//!
//! Logs go to stderr; systemd captures them to journald
//! (`journalctl --user -u rencal-notifierd`).

use std::path::PathBuf;

/// Resolve the icon path notify-send should use. Tries `RENCAL_NOTIFIER_ICON`
/// first (dev override), then standard XDG locations populated by the deb/rpm
/// bundle and `just install-notifierd`. Returns `None` if nothing's there;
/// notifications then fire iconless rather than failing.
fn icon_path() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("RENCAL_NOTIFIER_ICON") {
        return Some(p.into());
    }

    let mut candidates: Vec<PathBuf> = vec![
        PathBuf::from("/usr/share/icons/hicolor/128x128/apps/rencal.png"),
        PathBuf::from("/usr/share/icons/hicolor/128x128/apps/org.ren.rencal.png"),
    ];
    if let Some(data) = dirs::data_dir() {
        candidates.push(data.join("icons/hicolor/128x128/apps/rencal.png"));
    }

    candidates.into_iter().find(|p| p.exists())
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_secs()
        .init();

    log::info!("rencal-notifierd starting");
    let icon = icon_path();
    if let Some(p) = &icon {
        log::info!("icon: {}", p.display());
    } else {
        log::info!("icon: <none found> (set RENCAL_NOTIFIER_ICON to override)");
    }
    reminder_core::run_reminder_loop(reminder_core::NotifySendNotifier, icon).await;
}
