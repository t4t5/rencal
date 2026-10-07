use std::path::PathBuf;

use gpui_kit::component::Theme as KitTheme;
use gpui_kit::{App, TestAppContext};
use rencal_config::{ThemeConfig, ThemeMode};
use rencal_core::user_themes::{UserTheme, UserThemesSnapshot};
use rencal_theme::{Appearance, OmarchyColors, ThemeFamily};

use super::{ActiveRenTheme, ThemeStore, hsla};
use crate::settings::Settings;
use crate::test_support;

fn init(cx: &mut TestAppContext, theme: ThemeConfig, omarchy: Option<OmarchyColors>) {
    cx.update(|cx| test_support::init(theme, omarchy, cx));
}

fn active(cx: &mut TestAppContext) -> String {
    cx.update(|cx| ThemeStore::global(cx).active_id().to_owned())
}

fn set_theme(cx: &mut TestAppContext, theme: ThemeConfig) {
    cx.update(|cx| Settings::update(cx, |settings| settings.rencal.theme = theme));
}

/// gpui-kit's background matches renCal's.
fn assert_bridged(cx: &App) {
    assert_eq!(
        KitTheme::global(cx).background,
        hsla(cx.ren_theme().color("background"))
    );
    assert_eq!(
        KitTheme::global(cx).is_dark(),
        cx.ren_theme().appearance == Appearance::Dark
    );
}

fn user_theme(id: &str, json: &str) -> UserThemesSnapshot {
    let family = ThemeFamily::from_json(json).unwrap();
    UserThemesSnapshot {
        themes: vec![UserTheme {
            id: id.into(),
            file: PathBuf::from("dusk.json"),
            theme: family.themes[0].compile().0,
        }],
        diagnostics: Vec::new(),
    }
}

#[gpui_kit::test]
fn syncing_follows_the_os_appearance(cx: &mut TestAppContext) {
    init(cx, ThemeConfig::default(), None);
    assert_eq!(active(cx), "ren-light");
    cx.update(|cx| assert_bridged(cx));

    cx.update(|cx| ThemeStore::set_os_appearance(Appearance::Dark, cx));

    assert_eq!(active(cx), "ren");
    cx.update(|cx| assert_bridged(cx));
}

#[gpui_kit::test]
fn settings_changes_switch_the_theme(cx: &mut TestAppContext) {
    init(cx, ThemeConfig::default(), None);

    set_theme(
        cx,
        ThemeConfig {
            mode: ThemeMode::Single,
            single: "nord".into(),
            ..Default::default()
        },
    );
    cx.run_until_parked();

    assert_eq!(active(cx), "nord");
    cx.update(|cx| assert_bridged(cx));
}

#[gpui_kit::test]
fn syncing_on_omarchy_shows_its_palette(cx: &mut TestAppContext) {
    let colors = OmarchyColors {
        mode: Appearance::Dark,
        name: Some("tokyo-night".into()),
        background: "#1a1b26".into(),
        foreground: "#a9b1d6".into(),
        bright_foreground: "#c0caf5".into(),
        accent: "#7aa2f7".into(),
        red: "#f7768e".into(),
        green: "#9ece6a".into(),
        yellow: "#e0af68".into(),
        blue: "#7aa2f7".into(),
    };
    init(cx, ThemeConfig::default(), Some(colors));

    assert_eq!(active(cx), "omarchy");
    cx.update(|cx| {
        assert_eq!(cx.ren_theme().color("background").to_hex(), "#1a1b26ff");
        assert_bridged(cx);
    });

    cx.update(|cx| ThemeStore::set_omarchy(None, cx));

    assert_eq!(active(cx), "ren-light");
}

#[gpui_kit::test]
fn user_themes_apply_live_and_a_missing_one_shows_the_default(cx: &mut TestAppContext) {
    let single = ThemeConfig {
        mode: ThemeMode::Single,
        single: "user:dusk".into(),
        ..Default::default()
    };
    init(cx, single, None);
    let ren = rencal_theme::resolve_theme(&rencal_theme::builtin("ren").unwrap().theme).unwrap();
    cx.update(|cx| assert_eq!(*cx.ren_theme(), ren));

    cx.update(|cx| {
        ThemeStore::set_user_themes(
            user_theme(
                "user:dusk",
                r##"{ "name": "Dusk", "themes": [
                    { "name": "Dusk", "appearance": "light", "style": { "background": "#ffeeddff" } }
                ] }"##,
            ),
            cx,
        )
    });

    cx.update(|cx| {
        assert_eq!(cx.ren_theme().name, "Dusk");
        assert_eq!(cx.ren_theme().color("background").to_hex(), "#ffeeddff");
        assert_bridged(cx);
        let descriptors = ThemeStore::global(cx).descriptors();
        assert_eq!(descriptors.last().unwrap().id, "user:dusk");
    });

    cx.update(|cx| ThemeStore::set_user_themes(UserThemesSnapshot::default(), cx));

    assert_eq!(active(cx), "user:dusk");
    cx.update(|cx| assert_eq!(*cx.ren_theme(), ren));
}
