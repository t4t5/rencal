mod deep_links;
mod event_cache;
mod events;
mod external_themes;
mod fs_watch;
#[cfg(target_os = "linux")]
mod linux_reminders;
#[cfg(target_os = "macos")]
mod menu;
mod notifications;
#[cfg(target_os = "linux")]
mod nvidia_workaround;
mod oauth;
mod omarchy;
pub mod plugins;
mod routes;
mod signal;
#[cfg(target_os = "linux")]
mod single_instance;
pub mod state;
mod state_bridge;
mod tasks;
mod watchers;

use routes::caldir::{CaldirApi, CaldirApiImpl};
use routes::config::{ConfigApi, ConfigApiImpl};
use routes::omarchy::{OmarchyApi, OmarchyApiImpl};
use routes::platform::{PlatformApi, PlatformApiImpl, needs_native_decorations};
use routes::themes::{ThemesApi, ThemesApiImpl};
use state::AppState;
use std::path::PathBuf;
use std::sync::Arc;
use tasks::spawn_task;
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::DialogExt;
use taurpc::Router;

const MIN_WINDOW_WIDTH: f64 = 300.0;
const MIN_WINDOW_HEIGHT: f64 = 600.0;

/// Creates the taurpc router. Exposed for type generation.
pub fn create_router(state: Arc<AppState>) -> Router<tauri::Wry> {
    #[cfg(debug_assertions)]
    events::export_types().expect("failed to export notification types");
    Router::new()
        .merge(CaldirApiImpl::new(state.clone()).into_handler())
        .merge(PlatformApiImpl::new(state).into_handler())
        .merge(OmarchyApiImpl.into_handler())
        .merge(ConfigApiImpl.into_handler())
        .merge(ThemesApiImpl.into_handler())
}

/// Directory of the providers bundled with this build (google, icloud,
/// caldav, ...). Resolvable before the Tauri builder runs, which is when
/// `AppState` needs it.
fn bundled_providers_dir(context: &tauri::Context) -> PathBuf {
    let providers_dir = if cfg!(debug_assertions) {
        // In dev mode, Tauri doesn't copy resources — use the build output directly.
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("providers")
    } else {
        let resource_dir =
            tauri::utils::platform::resource_dir(context.package_info(), &tauri::Env::default())
                .expect("failed to resolve bundled providers directory")
                .join("providers");
        #[cfg(target_os = "linux")]
        {
            linux_bundled_providers_dir(std::env::current_exe().ok().as_deref(), resource_dir)
        }
        #[cfg(not(target_os = "linux"))]
        resource_dir
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

    providers_dir
}

#[cfg(target_os = "linux")]
fn linux_bundled_providers_dir(
    executable: Option<&std::path::Path>,
    resource_providers: PathBuf,
) -> PathBuf {
    // linuxdeploy rewrites ELF resources under usr/lib, breaking musl static-PIE
    // providers. AppImages ship them in usr/libexec instead; deb/rpm keep usr/lib.
    if let Some(exe_dir) = executable.and_then(std::path::Path::parent) {
        let providers = exe_dir.join("../libexec/renCal/providers");
        if providers.is_dir() {
            return providers;
        }
    }
    resource_providers
}

#[cfg(all(test, target_os = "linux"))]
mod bundled_providers_tests {
    use super::linux_bundled_providers_dir;

    #[test]
    fn appimage_prefers_libexec_over_resources() {
        let root = tempfile::tempdir().unwrap();
        let executable = root.path().join("usr/bin/rencal");
        let libexec = root.path().join("usr/libexec/renCal/providers");
        let resources = root.path().join("usr/lib/renCal/providers");
        std::fs::create_dir_all(executable.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&libexec).unwrap();
        std::fs::create_dir_all(&resources).unwrap();

        let selected = linux_bundled_providers_dir(Some(&executable), resources);
        assert_eq!(selected.canonicalize().unwrap(), libexec);
    }

    #[test]
    fn native_packages_fall_back_to_resources() {
        let root = tempfile::tempdir().unwrap();
        let executable = root.path().join("usr/bin/rencal");
        let resources = root.path().join("usr/lib/renCal/providers");
        std::fs::create_dir_all(executable.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&resources).unwrap();

        assert_eq!(
            linux_bundled_providers_dir(Some(&executable), resources.clone()),
            resources
        );
        assert_eq!(
            linux_bundled_providers_dir(None, resources.clone()),
            resources
        );
    }
}

/// Returns whether a main window existed to focus; the single-instance
/// listener acks a launch only when this is true.
fn focus_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    true
}

fn spawn_reminder_loop_if_needed(app: &tauri::App, state: Arc<AppState>) {
    #[cfg(target_os = "linux")]
    if !linux_reminders::should_run_in_process_reminders() {
        log::info!("rencal-notifierd is active — skipping in-process reminder loop");
        return;
    }

    spawn_task(
        "reminder loop",
        notifications::run_reminder_loop(app.handle().clone(), state),
    );
}

/// Shows `message` in a native dialog, then exits. Runs a minimal Tauri app so
/// the dialog has an event loop; `blocking_show` must not be used on the main
/// thread, so the exit happens in the dialog's callback.
fn run_fatal_dialog(context: tauri::Context<tauri::Wry>, message: String) {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            // The windows from tauri.conf.json are created regardless; keep
            // only the dialog visible.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.hide();
            }
            let handle = app.handle().clone();
            app.dialog()
                .message(&message)
                .title("renCal")
                .show(move |_| handle.exit(1));
            Ok(())
        })
        .run(context)
        .expect("error while showing startup error");
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

    // Disable WebKit's DMA-BUF renderer when the Nvidia GPU backs the
    // session (see issues #45 and #102).
    #[cfg(target_os = "linux")]
    nvidia_workaround::apply_if_needed();

    // Single-instance: on Linux we use a Unix socket because
    // `tauri-plugin-single-instance` panics under our runtime config (zbus
    // pulls in the tokio feature transitively from xdg-portal). On
    // macOS/Windows the plugin's native impl is fine.
    #[cfg(target_os = "linux")]
    let mut instance_guard = match single_instance::try_acquire_or_signal() {
        Some(g) => g,
        None => return, // existing instance acked and was focused; we exit.
    };

    // Keep the guard on this frame for the whole process; dropping it early
    // removes the socket and breaks single-instance detection.
    #[cfg(target_os = "linux")]
    let instance_listener = instance_guard.take_listener();

    let context = tauri::generate_context!();
    let state = match AppState::load(Some(bundled_providers_dir(&context))) {
        Ok(state) => Arc::new(state),
        Err(err) => {
            run_fatal_dialog(
                context,
                format!("renCal cannot read caldir's config.toml:\n{err}"),
            );
            return;
        }
    };
    let router = create_router(state.clone());

    let builder = tauri::Builder::default();

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        focus_main_window(app);
    }));

    // Native macOS menu bar
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(menu::build_menu)
        .on_menu_event(menu::handle_menu_event);

    builder
        .plugin(tauri_plugin_deep_link::init())
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
            if let Some(urls) = app.deep_link().get_current()? {
                let urls: Vec<String> = urls.into_iter().map(|url| url.to_string()).collect();
                deep_links::enqueue_urls(app.handle(), &state.deep_links, &urls);
            }

            let app_handle = app.handle().clone();
            let inbox_state = state.clone();
            app.deep_link().on_open_url(move |event| {
                let urls: Vec<String> = event.urls().iter().map(ToString::to_string).collect();
                if deep_links::enqueue_urls(&app_handle, &inbox_state.deep_links, &urls) > 0 {
                    focus_main_window(&app_handle);
                }
            });

            // Enable systemd notifications:
            #[cfg(target_os = "linux")]
            {
                linux_reminders::enable_notifierd_if_needed();
                if let Some(listener) = instance_listener {
                    let app_handle = app.handle().clone();
                    let inbox_state = state.clone();
                    single_instance::spawn_listener(listener, move |urls| {
                        if !urls.is_empty() {
                            deep_links::enqueue_urls(&app_handle, &inbox_state.deep_links, &urls);
                        }
                        focus_main_window(&app_handle)
                    });
                }
            }

            spawn_reminder_loop_if_needed(app, state.clone());

            // AppState notifications → webview events:
            spawn_task(
                "state bridge",
                state_bridge::run(app.handle().clone(), state.clone()),
            );

            // Omarchy theme, user CSS themes, caldir data + config, rencal config, timezone:
            watchers::spawn_all(app.handle(), &state);

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
        .build(context)
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen {
                has_visible_windows,
                ..
            } = _event
                && !has_visible_windows
                && let Some(window) = _app_handle.get_webview_window("main")
            {
                let _ = window.show();
                let _ = window.set_focus();
            }
        });
}
