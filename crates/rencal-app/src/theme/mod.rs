//! The `ThemeStore` global (GPUI_PORT_PLAN.md §4.7): every theme renCal can
//! show (built-ins, Omarchy, user JSON themes), which one shows, and its
//! resolved tokens. It resolves before the first window opens, then follows
//! `Settings` (the `[theme]` slots), the OS appearance, the Omarchy palette and
//! the user theme files. After every change it writes the result into
//! gpui-kit's theme (`bridge`).
//!
//! Plugin themes are still CSS (plugin contract v1). They come back with
//! contract v2 in Phase 7.

mod bridge;
pub mod fonts;
pub mod selection;

use std::sync::Arc;

use gpui_kit::{App, BorrowAppContext, Global, Hsla, Rgba as GpuiRgba, WindowAppearance};
use rencal_core::user_themes::{UserThemeDiagnostic, UserThemesSnapshot};
use rencal_theme::{
    Appearance, OMARCHY_THEME_ID, OmarchyColors, ResolvedTheme, Rgba, Theme, omarchy_theme,
    resolve_theme,
};

use crate::settings::Settings;
use selection::{ThemeDescriptor, active_theme, cycle_theme};

pub struct ThemeStore {
    user: UserThemesSnapshot,
    omarchy: Option<OmarchyColors>,
    os_appearance: Appearance,
    active_id: String,
    active: Arc<ResolvedTheme>,
}

impl Global for ThemeStore {}

/// `cx.ren_theme()`: the resolved renCal theme. Components read tokens and
/// slot styles through this, never through gpui-kit's theme.
pub trait ActiveRenTheme {
    fn ren_theme(&self) -> &ResolvedTheme;
}

impl ActiveRenTheme for App {
    fn ren_theme(&self) -> &ResolvedTheme {
        &ThemeStore::global(self).active
    }
}

/// The GPUI colour for a renCal one. Clips to sRGB like the old webview did.
pub fn hsla(color: Rgba) -> Hsla {
    let [r, g, b, a] = color.to_bytes();
    GpuiRgba {
        r: f32::from(r) / 255.0,
        g: f32::from(g) / 255.0,
        b: f32::from(b) / 255.0,
        a: f32::from(a) / 255.0,
    }
    .into()
}

pub fn appearance(appearance: WindowAppearance) -> Appearance {
    match appearance {
        WindowAppearance::Light | WindowAppearance::VibrantLight => Appearance::Light,
        WindowAppearance::Dark | WindowAppearance::VibrantDark => Appearance::Dark,
    }
}

/// Converts the backend's palette, read from Omarchy's `colors.toml`.
pub fn omarchy_colors(colors: rencal_core::omarchy::OmarchyColors) -> OmarchyColors {
    use rencal_core::omarchy::OmarchyMode;
    OmarchyColors {
        mode: match colors.mode {
            OmarchyMode::Light => Appearance::Light,
            OmarchyMode::Dark => Appearance::Dark,
        },
        name: colors.name,
        background: colors.background,
        foreground: colors.foreground,
        bright_foreground: colors.bright_foreground,
        accent: colors.accent,
        red: colors.red,
        green: colors.green,
        yellow: colors.yellow,
        blue: colors.blue,
    }
}

impl ThemeStore {
    pub fn global(cx: &App) -> &Self {
        cx.global::<Self>()
    }

    /// Resolves the configured theme and installs the store. `Settings` must be set.
    pub fn init(user: UserThemesSnapshot, omarchy: Option<OmarchyColors>, cx: &mut App) {
        log_diagnostics(&user.diagnostics);
        let mut store = Self {
            user,
            omarchy,
            os_appearance: appearance(cx.window_appearance()),
            active_id: String::new(),
            active: Arc::new(fallback()),
        };
        store.select(&Settings::global(cx).rencal.theme);
        bridge::apply(&store.active, cx);
        cx.set_global(store);
        cx.observe_global::<Settings>(|cx| Self::update(cx, |_| {}))
            .detach();
    }

    pub fn set_user_themes(user: UserThemesSnapshot, cx: &mut App) {
        log_diagnostics(&user.diagnostics);
        Self::update(cx, |store| store.user = user);
    }

    pub fn set_omarchy(colors: Option<OmarchyColors>, cx: &mut App) {
        Self::update(cx, |store| store.omarchy = colors);
    }

    /// The OS (window) appearance, which picks the slot while syncing.
    pub fn set_os_appearance(appearance: Appearance, cx: &mut App) {
        Self::update(cx, |store| store.os_appearance = appearance);
    }

    /// The showing slot's next theme (`mod+shift+t`).
    pub fn cycle(cx: &mut App) {
        let store = Self::global(cx);
        let next = cycle_theme(
            &Settings::global(cx).rencal.theme,
            &store.descriptors(),
            store.on_omarchy(),
            store.os_appearance,
        );
        Settings::update_rencal(cx, move |config| config.theme = next.clone());
    }

    pub fn active_id(&self) -> &str {
        &self.active_id
    }

    /// Omarchy is installed, so syncing follows its palette.
    pub fn on_omarchy(&self) -> bool {
        self.omarchy.is_some()
    }

    /// Every theme in display order: Omarchy, the listed built-ins, user themes.
    pub fn descriptors(&self) -> Vec<ThemeDescriptor> {
        let omarchy = self.omarchy.as_ref().map(|colors| ThemeDescriptor {
            id: OMARCHY_THEME_ID.into(),
            name: "Omarchy (Auto)".into(),
            appearance: colors.mode,
        });
        let builtins = rencal_theme::builtin_themes()
            .iter()
            .filter(|builtin| builtin.listed)
            .map(|builtin| (&builtin.id, &builtin.theme));
        let user = self.user.themes.iter().map(|user| (&user.id, &user.theme));
        omarchy
            .into_iter()
            .chain(builtins.chain(user).map(|(id, theme)| ThemeDescriptor {
                id: id.clone(),
                name: theme.name.clone(),
                appearance: theme.appearance,
            }))
            .collect()
    }

    /// The theme with `id`, unresolved. Dev-only built-ins are found too.
    pub fn theme(&self, id: &str) -> Option<Theme> {
        if id == OMARCHY_THEME_ID {
            return self
                .omarchy
                .as_ref()
                .map(|colors| omarchy_theme(colors).compile().0);
        }
        if let Some(builtin) = rencal_theme::builtin(id) {
            return Some(builtin.theme.clone());
        }
        self.user
            .themes
            .iter()
            .find(|user| user.id == id)
            .map(|user| user.theme.clone())
    }

    /// Applies `edit`, then re-selects; touches gpui-kit and the windows only
    /// when the shown theme changed.
    fn update(cx: &mut App, edit: impl FnOnce(&mut Self)) {
        let theme = Settings::global(cx).rencal.theme.clone();
        let changed = cx.update_global::<Self, _>(|store, _| {
            edit(store);
            store.select(&theme)
        });
        if changed {
            let active = Self::global(cx).active.clone();
            log::info!(
                "theme: showing {} ({})",
                Self::global(cx).active_id,
                active.name
            );
            bridge::apply(&active, cx);
        }
    }

    /// Picks and resolves the theme to show. True when it changed.
    fn select(&mut self, settings: &rencal_config::ThemeConfig) -> bool {
        let id = active_theme(settings, self.on_omarchy(), self.os_appearance).to_owned();
        // An unknown theme (e.g. a deleted user theme) shows the dark baseline.
        let resolved = match self.theme(&id).map(|theme| resolve_theme(&theme)) {
            Some(Ok(resolved)) => resolved,
            Some(Err(err)) => {
                log::error!("theme {id}: {err}; showing the default theme");
                fallback()
            }
            None => {
                log::warn!("theme {id} is not installed; showing the default theme");
                fallback()
            }
        };
        if id == self.active_id && resolved == *self.active {
            return false;
        }
        self.active_id = id;
        self.active = Arc::new(resolved);
        true
    }
}

fn fallback() -> ResolvedTheme {
    resolve_theme(rencal_theme::baseline(Appearance::Dark)).expect("the baseline resolves")
}

fn log_diagnostics(diagnostics: &[UserThemeDiagnostic]) {
    for diagnostic in diagnostics {
        log::warn!(
            "theme {}: {}",
            diagnostic.file.display(),
            diagnostic.message
        );
    }
}

#[cfg(test)]
mod tests;
