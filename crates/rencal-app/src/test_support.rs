//! Shared setup for headless GPUI tests: the globals `main` installs, without
//! touching the user's files.

use gpui_kit::App;
use rencal_config::{RencalConfig, ThemeConfig};
use rencal_core::caldir::{CaldirSettings, TimeFormat};
use rencal_core::user_themes::UserThemesSnapshot;
use rencal_theme::{Appearance, OmarchyColors};

use crate::settings::Settings;
use crate::theme::ThemeStore;
use crate::ui_state::UiState;

pub fn settings(theme: ThemeConfig) -> Settings {
    Settings {
        rencal: RencalConfig {
            theme,
            ..Default::default()
        },
        caldir: CaldirSettings {
            time_format: TimeFormat::H24,
            default_reminders: Vec::new(),
            default_calendar: None,
            calendar_dir: "~/caldir".into(),
        },
        system_tz: None,
    }
}

/// gpui-kit, `Settings`, an in-memory `UiState` and the theme store, with
/// the OS appearance light.
pub fn init(theme: ThemeConfig, omarchy: Option<OmarchyColors>, cx: &mut App) {
    gpui_kit::init(cx);
    cx.set_global(settings(theme));
    UiState::init_with(UiState::default(), None, cx);
    ThemeStore::init(UserThemesSnapshot::default(), omarchy, cx);
    ThemeStore::set_os_appearance(Appearance::Light, cx);
}
