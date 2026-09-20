/// Returns true when the window should use OS-native decorations.
///
/// - macOS uses the overlay titlebar configured in `tauri.macos.conf.json`.
/// - Linux only decorates on known stacking WMs (GNOME, KDE, etc.); tiling
///   WMs like Hyprland/sway/i3 stay decoration-free as the app expects.
/// - Windows always decorates.
pub fn needs_native_decorations() -> bool {
    #[cfg(target_os = "windows")]
    return true;

    #[cfg(target_os = "macos")]
    return false;

    #[cfg(target_os = "linux")]
    {
        let Ok(desktop) = std::env::var("XDG_CURRENT_DESKTOP") else {
            return false;
        };
        const STACKING_WMS: &[&str] = &[
            "GNOME",
            "KDE",
            "XFCE",
            "X-CINNAMON",
            "CINNAMON",
            "MATE",
            "LXQT",
            "LXDE",
            "PANTHEON",
            "BUDGIE",
            "UNITY",
            "DEEPIN",
        ];
        let desktop_upper = desktop.to_uppercase();
        return STACKING_WMS.iter().any(|wm| desktop_upper.contains(wm));
    }

    #[allow(unreachable_code)]
    false
}

use crate::deep_links::{EventDeepLink, PluginInstallLink};
use crate::state::AppState;
use std::sync::Arc;

#[taurpc::procedures(path = "platform", export_to = "../src/rpc/bindings.ts")]
pub trait PlatformApi {
    async fn needs_native_decorations() -> bool;
    async fn take_pending_event_links() -> Vec<EventDeepLink>;
    async fn has_pending_plugin_install() -> bool;
    async fn take_pending_plugin_install() -> Option<PluginInstallLink>;
}

#[derive(Clone)]
pub struct PlatformApiImpl {
    state: Arc<AppState>,
}

impl PlatformApiImpl {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }
}

#[taurpc::resolvers]
impl PlatformApi for PlatformApiImpl {
    async fn needs_native_decorations(self) -> bool {
        needs_native_decorations()
    }

    async fn take_pending_event_links(self) -> Vec<EventDeepLink> {
        self.state.deep_links.take()
    }

    async fn has_pending_plugin_install(self) -> bool {
        self.state.deep_links.has_plugin_install()
    }

    async fn take_pending_plugin_install(self) -> Option<PluginInstallLink> {
        self.state.deep_links.take_plugin_install()
    }
}
