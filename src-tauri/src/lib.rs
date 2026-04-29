mod caldir_watcher;
mod config;
mod notifications;
mod oauth;
mod omarchy;
mod routes;
#[cfg(target_os = "linux")]
mod single_instance;

use routes::caldir::{CaldirApi, CaldirApiImpl};
use routes::config::{ConfigApi, ConfigApiImpl};
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
        .merge(ConfigApiImpl.into_handler())
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

    // SAFETY: called from Tauri's setup hook before any caldir provider is
    // spawned; no other thread reads CALDIR_PROVIDER_PATH concurrently.
    unsafe {
        std::env::set_var("CALDIR_PROVIDER_PATH", &providers_dir);
    }
}

/// On Linux, defer to `rencal-notifierd` (a separate systemd-managed daemon)
/// when it's active. Otherwise (daemon not installed, or any other platform)
/// run the loop in-process. Avoids duplicate notifications when both are running.
fn should_run_in_process_reminders() -> bool {
    #[cfg(target_os = "linux")]
    {
        let active = std::process::Command::new("systemctl")
            .args(["--user", "is-active", "--quiet", "rencal-notifierd.service"])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        return !active;
    }
    #[cfg(not(target_os = "linux"))]
    true
}

/// On Linux, package installs (deb/rpm/AUR) drop the daemon's unit file at
/// `/usr/lib/systemd/user/rencal-notifierd.service` but each user still has to
/// enable it once. Detect that state on launch and enable+start automatically
/// — making the daemon "just work" no matter how rencal was installed.
///
/// Skipped if the unit isn't visible to systemctl at all (dev builds, manual
/// AppImage runs, or non-systemd systems): users in those flows install via
/// `just install-notifierd` or accept the in-process fallback.
#[cfg(target_os = "linux")]
fn enable_notifierd_if_needed() {
    let status = std::process::Command::new("systemctl")
        .args(["--user", "is-enabled", "--quiet", "rencal-notifierd.service"])
        .status();
    match status {
        Ok(s) if s.success() => return, // already enabled
        Ok(_) => {}                     // disabled or not-found — proceed
        Err(_) => return,               // no systemctl available — skip
    }

    // Distinguish "disabled" from "doesn't exist". list-unit-files returns 0
    // and prints rows when the unit is known to systemd.
    let exists = std::process::Command::new("systemctl")
        .args([
            "--user",
            "list-unit-files",
            "rencal-notifierd.service",
            "--no-legend",
        ])
        .output()
        .map(|o| o.status.success() && !o.stdout.is_empty())
        .unwrap_or(false);
    if !exists {
        return;
    }

    log::info!("Enabling rencal-notifierd.service for the current user");
    let _ = std::process::Command::new("systemctl")
        .args(["--user", "enable", "--now", "rencal-notifierd.service"])
        .status();
}

#[tokio::main]
pub async fn run() {
    // Force a dark GTK theme so the native titlebar drawn by the WM/compositor
    // matches the app's dark UI instead of the user's (usually light) system theme.
    // Must be set before GTK initializes, hence at the very top of run().
    #[cfg(target_os = "linux")]
    if needs_native_decorations() {
        // SAFETY: first statement in run(), before GTK initializes; no other
        // thread reads GTK_THEME at this point.
        unsafe {
            std::env::set_var("GTK_THEME", "Adwaita:dark");
        }
    }

    // Single-instance: on Linux we use a Unix socket because
    // `tauri-plugin-single-instance` panics under our runtime config (zbus
    // pulls in the tokio feature transitively from xdg-portal). On
    // macOS/Windows the plugin's native impl is fine.
    #[cfg(target_os = "linux")]
    let mut instance_guard = match single_instance::try_acquire_or_signal() {
        Some(g) => g,
        None => return, // existing instance was signaled to focus; we exit.
    };

    let router = create_router();

    let builder = tauri::Builder::default();

    #[cfg(not(target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));

    builder
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .clear_targets()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stderr,
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir { file_name: None },
                ))
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
                .max_file_size(1_000_000)
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            setup_bundled_providers(app);
            #[cfg(target_os = "linux")]
            {
                enable_notifierd_if_needed();
                let app_handle = app.handle().clone();
                single_instance::spawn_listener(&mut instance_guard, move || {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                });
            }
            if should_run_in_process_reminders() {
                tokio::spawn(notifications::run_reminder_loop(app.handle().clone()));
            } else {
                log::info!("rencal-notifierd is active — skipping in-process reminder loop");
            }
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
