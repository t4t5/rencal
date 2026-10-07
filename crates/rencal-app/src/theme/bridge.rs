//! Projects the resolved renCal theme onto gpui-kit's `Theme` global so stock
//! components match (GPUI_PORT_PLAN.md §4.8). renCal owns its registry; the
//! gpui-kit `ThemeConfig` built here is a throwaway carrier for the mapped
//! values, never loaded from or written to a file. Colours gpui-kit has no
//! renCal equivalent for (button variants, charts, …) keep gpui-kit's own
//! derivation from the mapped ones.

use std::rc::Rc;

use gpui_kit::component::{Theme, ThemeConfig};
use gpui_kit::{App, SharedString};
use rencal_theme::{Appearance, Fill, ResolvedTheme, Rgba, Slot, State};
use serde_json::{Map, Value as Json, json};

/// What every CSS generic font family name stands for in GPUI.
enum Generic {
    Sans,
    Mono,
}

fn generic(family: &str) -> Option<Generic> {
    match family {
        "system-ui" | "-apple-system" | "BlinkMacSystemFont" | "sans-serif" | "ui-sans-serif"
        | "serif" | "ui-serif" => Some(Generic::Sans),
        "monospace" | "ui-monospace" => Some(Generic::Mono),
        _ => None,
    }
}

/// The first family in a theme's font list that GPUI can draw: an installed
/// (or embedded) family, or a CSS generic name mapped to GPUI's system font or
/// gpui-kit's installed monospace default. An empty list means sans.
pub fn font_family(list: &[String], installed: &[String]) -> SharedString {
    for family in list {
        match generic(family) {
            Some(Generic::Sans) => return ".SystemUIFont".into(),
            Some(Generic::Mono) => return Theme::default().mono_font_family,
            None if installed.iter().any(|name| name == family) => return family.clone().into(),
            None => {}
        }
    }
    ".SystemUIFont".into()
}

fn hex(color: Rgba) -> Json {
    Json::String(color.to_hex())
}

/// A slot's fill as a solid colour; gpui-kit only takes solid tokens from us.
fn solid(fill: Option<Fill>) -> Option<Rgba> {
    match fill? {
        Fill::Solid(color) => Some(color),
        Fill::Gradient { from, .. } => Some(from),
    }
}

/// The gpui-kit theme file for `theme`, keyed as gpui-kit's `ThemeConfig` is.
pub fn theme_config(theme: &ResolvedTheme, body_font: &str, mono_font: &str) -> ThemeConfig {
    let c = |key: &str| hex(theme.color(key));
    let tabs_list = theme.slot(Slot::TabsList, None);
    let selected_tab = theme.slot(Slot::TabsTab, Some(State::Selected));
    let tab = theme.slot(Slot::TabsTab, None);

    let mut colors = Map::new();
    let mut set = |key: &str, value: Json| {
        colors.insert(key.to_owned(), value);
    };
    set("background", c("background"));
    set("foreground", c("text"));
    set("border", c("border"));
    set("input.border", c("border.input"));
    set("ring", c("border.focused"));
    set("primary.background", c("primary"));
    set("primary.hover.background", c("primary.hover"));
    set("primary.foreground", c("primary.text"));
    set("secondary.background", c("element.background"));
    set("secondary.hover.background", c("element.hover"));
    set("secondary.foreground", c("element.text"));
    set("accent.background", c("element.highlight"));
    set("accent.foreground", c("element.highlight.text"));
    set("muted.background", c("element.muted"));
    set("muted.foreground", c("text.muted"));
    set("popover.background", c("elevated_surface.background"));
    set("popover.foreground", c("elevated_surface.text"));
    set("danger.background", c("error"));
    set("danger.hover.background", c("error.hover"));
    set("danger.foreground", c("error.text"));
    set("success.background", c("success"));
    set("warning.background", c("warning"));
    set("sidebar.background", c("sidebar.background"));
    set("sidebar.foreground", c("text"));
    set("sidebar.border", c("border"));
    set("sidebar.accent.background", c("element.selected"));
    set("sidebar.accent.foreground", c("element.selected.text"));
    set("list.active.background", c("element.selected"));
    set("list.hover.background", c("ghost_element.hover"));
    set(
        "tab_bar.background",
        hex(solid(tabs_list.fill).unwrap_or(theme.color("element.background"))),
    );
    set(
        "tab.background",
        hex(solid(tab.fill).unwrap_or(Rgba::TRANSPARENT)),
    );
    set(
        "tab.foreground",
        hex(tab.text.unwrap_or(theme.color("text.muted"))),
    );
    set(
        "tab.active.background",
        hex(solid(selected_tab.fill).unwrap_or(theme.color("element.selected"))),
    );
    set(
        "tab.active.foreground",
        hex(selected_tab
            .text
            .unwrap_or(theme.color("element.selected.text"))),
    );
    set("scrollbar.background", c("scrollbar.track.background"));
    set(
        "scrollbar.thumb.background",
        c("scrollbar.thumb.background"),
    );
    set(
        "scrollbar.thumb.hover.background",
        c("scrollbar.thumb.hover_background"),
    );
    set(
        "selection.background",
        hex(theme.color("primary").with_alpha(0.3)),
    );
    set("caret", c("text"));
    set("overlay", c("overlay"));
    set("title_bar.background", c("background"));
    set("title_bar.border", c("border"));
    set("window.border", c("border"));

    let radius = theme.number("radius").max(0.0);
    let config = json!({
        "name": theme.name,
        "mode": match theme.appearance {
            Appearance::Light => "light",
            Appearance::Dark => "dark",
        },
        "font.family": body_font,
        "font.size": theme.number("text.scale.base.size"),
        "mono_font.family": mono_font,
        "radius": radius.round() as usize,
        "radius.lg": (radius * 1.4).round() as usize,
        "shadow": true,
        "colors": colors,
    });
    serde_json::from_value(config).expect("the mapped theme matches gpui-kit's ThemeConfig")
}

/// Writes `theme` into gpui-kit's global theme and refreshes every window.
pub fn apply(theme: &ResolvedTheme, cx: &mut App) {
    let installed = cx.text_system().all_font_names();
    let body = font_family(theme.fonts("font.body"), &installed);
    let mono = font_family(theme.fonts("font.mono"), &installed);
    let config = Rc::new(theme_config(theme, &body, &mono));
    Theme::update(cx, |gpui_theme| gpui_theme.apply_config(&config));
}

#[cfg(test)]
mod tests {
    use super::*;
    use gpui_kit::component::ThemeMode;

    fn resolved(id: &str) -> ResolvedTheme {
        rencal_theme::resolve_theme(&rencal_theme::builtin(id).unwrap().theme).unwrap()
    }

    #[test]
    fn maps_generic_and_installed_families() {
        let installed = vec!["Geist Mono".to_owned()];
        let list = |names: &[&str]| names.iter().map(|n| n.to_string()).collect::<Vec<_>>();
        assert_eq!(
            font_family(&list(&["Geist Mono", "monospace"]), &installed),
            "Geist Mono"
        );
        assert_eq!(
            font_family(&list(&["Pixelated MS Sans Serif", "system-ui"]), &installed),
            ".SystemUIFont"
        );
        assert_eq!(
            font_family(&list(&["Missing", "ui-monospace"]), &installed),
            Theme::default().mono_font_family
        );
        assert_eq!(font_family(&[], &installed), ".SystemUIFont");
    }

    #[test]
    fn every_builtin_maps_onto_a_valid_gpui_kit_theme() {
        for builtin in rencal_theme::builtin_themes() {
            let theme = rencal_theme::resolve_theme(&builtin.theme).unwrap();
            let config = theme_config(&theme, ".SystemUIFont", "Geist Mono");
            assert_eq!(config.mode.is_dark(), theme.appearance == Appearance::Dark);
        }
    }

    #[test]
    fn carries_the_primitives_through() {
        let ren = resolved("ren");
        let config = theme_config(&ren, ".SystemUIFont", "Geist Mono");
        let colors = serde_json::to_value(&config.colors).unwrap();
        assert_eq!(colors["background"], ren.color("background").to_hex());
        assert_eq!(colors["foreground"], ren.color("text").to_hex());
        assert_eq!(colors["primary.background"], ren.color("primary").to_hex());
        assert_eq!(config.mode, ThemeMode::Dark);
        assert_eq!(config.radius, Some(0));
        assert_eq!(config.mono_font_family.as_deref(), Some("Geist Mono"));
    }
}
