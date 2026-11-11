//! renCal's backend as the native module TSX imports from `rencal/native`.
//! `Backend.call` reaches every procedure in `routes/dispatch.rs`, and
//! `Backend.onEvent` delivers what `AppEvent` announces.

mod annotate;
mod atomic_write;
pub mod control;
mod deep_links;
mod event_cache;
mod events;
mod external_themes;
mod external_views;
mod fs_watch;
mod host;
mod keys;
#[cfg(target_os = "linux")]
mod linux_reminders;
#[cfg(target_os = "macos")]
mod macos_notifications;
mod notifications;
mod oauth;
mod omarchy;
pub mod plugins;
mod routes;
mod signal;
pub mod skill_install;
pub mod state;
mod state_bridge;
mod tasks;
mod time_zone;
mod watchers;

use std::path::PathBuf;
use std::sync::{Arc, LazyLock, OnceLock};

use nsh_core::JsonValue;
use nsh_core::prelude::*;
use serde_json::{Value, json};
use tokio::runtime::Runtime;

use host::AppHandle;
use routes::agents::AgentsApiImpl;
use routes::caldir::CaldirApiImpl;
use routes::commands::CommandsApiImpl;
use routes::config::ConfigApiImpl;
use routes::dispatch::Router;
use routes::keys::KeysApiImpl;
use routes::omarchy::OmarchyApiImpl;
use routes::platform::PlatformApiImpl;
use routes::plugins::PluginsApiImpl;
use routes::themes::ThemesApiImpl;
use routes::views::ViewsApiImpl;
use state::{AppState, ProviderDirs};
use tasks::spawn_task;

/// The backend's own runtime: watchers and provider calls outlive any one
/// engine task.
static RUNTIME: LazyLock<Runtime> =
    LazyLock::new(|| Runtime::new().expect("failed to start the backend's runtime"));

/// Set once `start` has loaded the state; a failed load is kept to report.
static ROUTER: OnceLock<Result<Arc<Router>, String>> = OnceLock::new();

/// The crate's UI set: what TSX imports from `rencal/native`.
#[native_module("rencal/native")]
fn native(registry: &mut Registry) {
    registry.module::<Backend>();
}

/// Providers shipped with this build: next to the binary when packaged, the
/// Tauri crate's download directory in development.
fn bundled_providers_dir() -> PathBuf {
    if cfg!(debug_assertions) {
        return PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../src-tauri/providers");
    }
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("providers")))
        .unwrap_or_else(|| PathBuf::from("providers"))
}

fn load() -> Result<Arc<Router>, String> {
    let provider_dirs = ProviderDirs {
        bundled: Some(bundled_providers_dir()),
        plugins: plugins::plugins_dir().ok(),
    };
    let state = AppState::load(provider_dirs)
        .map(Arc::new)
        .map_err(|err| format!("renCal cannot read caldir's config.toml:\n{err}"))?;
    let plugins = plugins::PluginManager::system()
        .map_err(|err| format!("renCal cannot initialize plugin storage:\n{err}"))?;

    let _guard = RUNTIME.enter();

    // What this launch was started with; later launches come through `openLaunchArgs`.
    let cwd = std::env::current_dir().unwrap_or_default();
    let args: Vec<String> = std::env::args().skip(1).collect();
    deep_links::enqueue_urls(&AppHandle, &state.deep_links, &launch_urls(&args, &cwd));

    // Registered at launch so a click that cold-launches renCal is delivered.
    #[cfg(target_os = "macos")]
    macos_notifications::init(state.clone());

    // Development runs leave the user's installed notifier and skills alone.
    if !cfg!(debug_assertions) {
        #[cfg(target_os = "linux")]
        {
            linux_reminders::enable_notifierd_if_needed();
            linux_reminders::restart_notifierd_if_upgraded();
        }
        spawn_task("agent skills", skill_install::refresh());
    }

    #[cfg(target_os = "linux")]
    let in_process_reminders = linux_reminders::should_run_in_process_reminders();
    #[cfg(not(target_os = "linux"))]
    let in_process_reminders = true;
    if in_process_reminders && !cfg!(debug_assertions) {
        spawn_task("reminder loop", notifications::run_reminder_loop(AppHandle));
    }

    #[cfg(unix)]
    spawn_task("control socket", control::serve(AppHandle, state.clone()));
    spawn_task("state bridge", state_bridge::run(AppHandle, state.clone()));
    watchers::spawn_all(&AppHandle, &state, &plugins);

    Ok(Arc::new(Router {
        state: state.clone(),
        agents: AgentsApiImpl,
        caldir: CaldirApiImpl::new(state.clone()),
        commands: CommandsApiImpl::new(state.clone()),
        config: ConfigApiImpl,
        keys: KeysApiImpl,
        omarchy: OmarchyApiImpl,
        platform: PlatformApiImpl::new(state),
        plugins: PluginsApiImpl::new(plugins),
        themes: ThemesApiImpl,
        views: ViewsApiImpl,
    }))
}

/// The `rencal:` links and `.ics` files among a launch's arguments, as URLs.
fn launch_urls(args: &[String], cwd: &std::path::Path) -> Vec<String> {
    let mut urls: Vec<String> =
        args.iter().filter(|arg| arg.starts_with("rencal:")).cloned().collect();
    urls.extend(deep_links::ics_file_urls(args, cwd));
    urls
}

fn router() -> Result<Arc<Router>, Value> {
    ROUTER
        .get_or_init(load)
        .clone()
        .map_err(|message| json!({ "kind": "configuration", "message": message }))
}

/// renCal's backend: calendars, events, settings, plugins.
#[module]
pub struct Backend;

#[module]
impl Backend {
    /// Runs the procedure `path` (`caldir.list_events`) with positional
    /// arguments; resolves with `{ ok }`, or `{ err }` holding an `RpcError`.
    pub async fn call(path: String, args: Vec<JsonValue>) -> JsonValue {
        let task = RUNTIME.spawn(async move {
            let router = router()?;
            router.call(&path, args).await
        });
        match task.await {
            Ok(Ok(value)) => json!({ "ok": value }),
            Ok(Err(error)) => json!({ "err": error }),
            Err(error) => json!({ "err": { "kind": "internal", "message": error.to_string() } }),
        }
    }

    /// Calls `listener` with each `AppEvent`'s name and payload, for the
    /// app's life: the promise resolves only if the backend goes away.
    pub async fn on_event(#[args(name, payload)] listener: Callback<(String, JsonValue)>) {
        let mut events = host::subscribe();
        while let Some(event) = next_event(&mut events).await {
            listener.post(event);
        }
    }

    /// The offset from UTC of the IANA zone `tz` at `epoch_ms`, in
    /// milliseconds; `null` for an unknown zone.
    pub fn zone_offset_ms(tz: String, epoch_ms: f64) -> Option<f64> {
        time_zone::offset_ms(&tz, epoch_ms)
    }

    /// The UTC instants, as epoch milliseconds, that the wallclock `local_ms`
    /// (a UTC-based count of the local fields) names in `tz`: none in a gap,
    /// two in a fold.
    pub fn zone_instants_ms(tz: String, local_ms: f64) -> Vec<f64> {
        time_zone::instants_ms(&tz, local_ms)
    }

    /// The system's IANA time zone.
    pub fn system_zone() -> String {
        iana_time_zone::get_timezone().unwrap_or_else(|_| "UTC".to_owned())
    }

    /// Whether `tz` is a known IANA zone.
    pub fn is_zone(tz: String) -> bool {
        tz.parse::<chrono_tz::Tz>().is_ok()
    }

    /// Every IANA zone name.
    pub fn zones() -> Vec<String> {
        chrono_tz::TZ_VARIANTS.iter().map(|tz| tz.name().to_owned()).collect()
    }

    /// The colors of theme file `json` by token, as `#rrggbbaa`: previews paint
    /// a theme that isn't the one drawn.
    pub async fn theme_colors(json: String, dark: bool) -> Result<JsonValue, String> {
        let tokens = nsh_base::tokens_of(Some(&json))?;
        let colors = tokens.colors().map(|(name, color)| {
            let color = if dark { color.dark } else { color.light };
            (name.to_owned(), json!(format!("#{:08x}", nsh_core::Color::from(color).0)))
        });
        Ok(Value::Object(colors.collect()))
    }

    /// The path picked in the system's open dialog, a folder when `folder`,
    /// else a file with one of `extensions`; `null` when cancelled.
    pub async fn pick_path(
        folder: bool,
        title: String,
        extensions: Vec<String>,
    ) -> Result<Option<String>, String> {
        use nsh_core::file_dialog::{FileFilter, OpenDialog};
        let dialog = if folder { OpenDialog::folders() } else { OpenDialog::files() }.title(title);
        let dialog = if extensions.is_empty() {
            dialog
        } else {
            dialog.filter(FileFilter::new("Calendar files", extensions))
        };
        let picked = nsh_core::element::pick_paths(dialog).await?;
        let first = picked.and_then(|paths| paths.into_iter().next());
        Ok(first.map(|path| path.to_string_lossy().into_owned()))
    }

    /// Whether the machine has a default route, what `navigator.onLine` reported.
    pub async fn is_online() -> bool {
        has_default_route(
            &std::fs::read_to_string("/proc/net/route").unwrap_or_default(),
            &std::fs::read_to_string("/proc/net/ipv6_route").unwrap_or_default(),
        ) || !std::path::Path::new("/proc/net/route").exists()
    }


    /// Opens what a later launch of the app was started with (NSH's single
    /// instance hands it over): its `rencal:` links and `.ics` files.
    pub async fn open_launch_args(args: Vec<String>, cwd: String) -> Result<(), JsonValue> {
        let router = router()?;
        let urls = launch_urls(&args, std::path::Path::new(&cwd));
        deep_links::enqueue_urls(&AppHandle, &router.state.deep_links, &urls);
        Ok(())
    }

    /// Whether windows get the system's frame: off on tiling compositors, which
    /// would otherwise show GTK's header bar on a dialog.
    pub fn needs_native_decorations() -> bool {
        routes::platform::needs_native_decorations()
    }

    /// Whether annotate mode is on, from `RENCAL_ANNOTATE`, which TSX's
    /// `process.env` doesn't see in every host.
    pub fn annotate_enabled() -> bool {
        annotate::enabled()
    }

    /// Saves annotate mode's notes with a screenshot of the window, where
    /// `RENCAL_ANNOTATE` says; resolves with the notes' path.
    pub async fn save_annotations(markdown: String) -> Result<String, String> {
        let task = RUNTIME.spawn(annotate::save(markdown));
        task.await.map_err(|error| error.to_string())?
    }

    /// Opens `url` in the user's browser.
    pub fn open_url(url: String) -> Result<(), String> {
        host::open_url(&url).map_err(|error| error.to_string())
    }
}

/// Whether either routing table of `/proc/net` has a default route. Loopback's
/// IPv6 table always has an unreachable one.
fn has_default_route(ipv4: &str, ipv6: &str) -> bool {
    let v4 = ipv4.lines().skip(1).any(|line| line.split_whitespace().nth(1) == Some("00000000"));
    let v6 = ipv6.lines().any(|line| {
        let fields: Vec<&str> = line.split_whitespace().collect();
        fields.first().is_some_and(|dest| dest.bytes().all(|b| b == b'0'))
            && fields.get(1) == Some(&"00")
            && fields.last() != Some(&"lo")
    });
    v4 || v6
}

/// The next event; `None` once the sender is gone. A lagged receiver skips
/// ahead, since events only mean "refetch".
async fn next_event(
    events: &mut tokio::sync::broadcast::Receiver<(String, Value)>,
) -> Option<(String, Value)> {
    use tokio::sync::broadcast::error::RecvError;
    loop {
        match events.recv().await {
            Ok(event) => return Some(event),
            Err(RecvError::Lagged(_)) => continue,
            Err(RecvError::Closed) => return None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::has_default_route;

    const V4_HEADER: &str = "Iface\tDestination\tGateway\n";
    const V6_LO: &str = "00000000000000000000000000000000 00 00000000000000000000000000000000 00 00000000000000000000000000000000 ffffffff 00000001 00000000 00200200 lo\n";

    #[test]
    fn a_default_route_means_online() {
        let v4 = format!("{V4_HEADER}wlan0\t00000000\t0101A8C0\n");
        assert!(has_default_route(&v4, ""));
        let v6 = V6_LO.replace(" lo", " wlan0");
        assert!(has_default_route(V4_HEADER, &v6));
    }

    #[test]
    fn local_routes_mean_offline() {
        let v4 = format!("{V4_HEADER}wlan0\t0001A8C0\t00000000\n");
        assert!(!has_default_route(&v4, V6_LO));
    }
}
