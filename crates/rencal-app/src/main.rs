//! renCal's native app on GPUI via gpui-kit (GPUI_PORT_PLAN.md). Startup:
//! logging, single instance (Linux), the backend runtime and `AppState`, then
//! the globals (settings, UI state, theme) resolve before the first window
//! opens, so it never flashes the wrong theme.

mod actions;
mod assets;
mod backend;
mod clock;
mod commands;
mod deep_links;
mod editing;
mod event_store;
mod keymap;
mod logging;
mod navigation;
mod palette;
mod runtime;
mod search;
mod settings;
mod shortcuts_overlay;
mod sidebar;
mod sync_state;
#[cfg(test)]
mod test_support;
mod theme;
mod toolbar;
mod ui;
mod ui_state;
mod views;
mod watchers;
mod windows;

use std::path::PathBuf;
use std::sync::Arc;

use gpui_kit::App;
use rencal_core::caldir::CaldirSettings;
use rencal_core::plugins::{self, PluginManager};
use rencal_core::state::{AppState, ProviderDirs};
use tokio::sync::mpsc;

use crate::backend::Backend;
use crate::clock::Clock;
use crate::event_store::EventStore;
use crate::navigation::Navigation;
use crate::runtime::Tokio;
use crate::settings::Settings;
use crate::sync_state::SyncState;
use crate::theme::ThemeStore;
use crate::ui_state::UiState;
use crate::windows::{fatal, main_window};

/// The single-instance socket name. The Tauri app owns `rencal` until cutover.
#[cfg(target_os = "linux")]
const INSTANCE_NAME: &str = "rencal-gpui";

struct LoadedBackend {
    state: Arc<AppState>,
    plugins: PluginManager,
}

fn main() {
    logging::init();

    #[cfg(target_os = "linux")]
    let mut instance = match rencal_core::single_instance::try_acquire_or_signal(INSTANCE_NAME) {
        Some(guard) => guard,
        // A running renCal acked and is showing its window.
        None => return,
    };

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .thread_name("rencal-backend")
        .build()
        .expect("failed to start the backend runtime");
    let backend = load_backend();
    let launch_urls = rencal_core::deep_links::launch_urls();
    let (requests, requests_rx) = mpsc::unbounded_channel();

    let app = gpui_kit::application().with_assets(assets::Assets);
    let open_urls = requests.clone();
    app.on_open_urls(move |urls| {
        let _ = open_urls.send(deep_links::Request { urls, reply: None });
    });
    // macOS: clicking the dock icon with no window open shows it again.
    app.on_reopen(|cx| {
        if cx.has_global::<Settings>() && !main_window::show(cx) {
            open_main_window(cx);
        }
    });

    let handle = runtime.handle().clone();
    #[cfg(target_os = "linux")]
    let listener = instance.take_listener();
    app.run(move |cx| {
        gpui_kit::init(cx);
        Tokio::init(handle, cx);
        theme::fonts::register(cx);
        match backend {
            Ok(backend) => {
                start(backend, launch_urls, requests_rx, cx);
                #[cfg(target_os = "linux")]
                if let Some(listener) = listener {
                    deep_links::spawn_instance_listener(listener, requests);
                }
            }
            Err(message) => fatal::open(message, cx),
        }
    });

    // Held until here: dropping the guard removes the socket.
    #[cfg(target_os = "linux")]
    drop(instance);
}

fn load_backend() -> Result<LoadedBackend, String> {
    let provider_dirs = ProviderDirs {
        bundled: bundled_providers_dir(),
        plugins: plugins::plugins_dir().ok(),
    };
    let state = AppState::load(provider_dirs)
        .map_err(|err| format!("renCal cannot read caldir's config.toml:\n{err}"))?;
    let plugins = PluginManager::system()
        .map_err(|err| format!("renCal cannot initialize plugin storage:\n{err}"))?;
    Ok(LoadedBackend {
        state: Arc::new(state),
        plugins,
    })
}

/// The caldir providers shipped with this build. Debug builds use the ones
/// `just ensure-providers` downloads; packaging lands in Phase 6.
fn bundled_providers_dir() -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        return Some(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../src-tauri/providers"));
    }
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    ["../libexec/renCal/providers", "../lib/renCal/providers"]
        .into_iter()
        .map(|relative| exe_dir.join(relative))
        .find(|dir| dir.is_dir())
}

fn start(
    backend: LoadedBackend,
    launch_urls: Vec<String>,
    requests: mpsc::UnboundedReceiver<deep_links::Request>,
    cx: &mut App,
) {
    let LoadedBackend { state, plugins } = backend;
    cx.set_global(Settings {
        rencal: settings::load_rencal_config(),
        caldir: CaldirSettings::from(state.caldir().config()),
        system_tz: iana_time_zone::get_timezone().ok(),
    });
    UiState::init(cx);
    let omarchy = rencal_core::omarchy::read_colors().map(theme::omarchy_colors);
    ThemeStore::init(rencal_core::user_themes::scan(), omarchy, cx);
    actions::init(cx);
    watchers::spawn_all(&state, &plugins, cx);
    Backend::init(state.clone(), cx);
    Clock::init(cx);
    Clock::start_ticking(cx);
    Navigation::init(cx);
    EventStore::init(cx);
    SyncState::init(cx);
    toolbar::init(cx);
    editing::init(cx);

    deep_links::intake(&state, &launch_urls);
    deep_links::listen(state, requests, cx);
    open_main_window(cx);
    deep_links::open_event_links(cx);

    // Closing the main window quits, except on macOS, where apps stay in the
    // dock and the dock icon reopens it.
    cx.on_window_closed(|cx, closed| {
        let main = main_window::handle(cx).map(|handle| handle.window_id());
        if main == Some(closed) && !cfg!(target_os = "macos") {
            cx.quit();
        }
    })
    .detach();
}

fn open_main_window(cx: &mut App) {
    if let Err(err) = main_window::open(cx) {
        log::error!("could not open the main window: {err}");
        cx.quit();
    }
}
