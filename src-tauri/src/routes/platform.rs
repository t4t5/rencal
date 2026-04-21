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

#[taurpc::procedures(path = "platform", export_to = "../src/rpc/bindings.ts")]
pub trait PlatformApi {
    async fn needs_native_decorations() -> bool;
}

#[derive(Clone)]
pub struct PlatformApiImpl;

#[taurpc::resolvers]
impl PlatformApi for PlatformApiImpl {
    async fn needs_native_decorations(self) -> bool {
        needs_native_decorations()
    }
}
