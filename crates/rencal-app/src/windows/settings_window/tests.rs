//! Headless tests of the settings window (GPUI_PORT_PLAN.md §9): the page
//! list, calendar groups and the plugin grid. Nothing here writes the
//! user's files: without the backend runtime, settings stay in memory.

use gpui_kit::component::WindowExt;
use gpui_kit::{AnyWindowHandle, Entity, Modifiers, TestAppContext, VisualTestContext};
use rencal_config::ThemeConfig;
use rencal_core::plugins::{
    ContributionKind, InstalledPlugin, InstalledPlugins, PluginCatalog, PluginCatalogEntry,
};
use rencal_time::Calendar;

use super::calendars::CalendarsPage;
use super::plugins::PluginsPage;
use super::{SettingsTab, SettingsWindow};
use crate::event_store::EventStore;
use crate::settings::Settings;
use crate::{actions, test_support};

fn calendar(slug: &str, name: &str) -> Calendar {
    Calendar {
        slug: slug.into(),
        name: Some(name.into()),
        color: Some("#4c8bf5".into()),
        provider: None,
        account: None,
        read_only: None,
    }
}

/// The settings window over two local calendars, active (focus events only
/// fire in the active window).
fn open(cx: &mut TestAppContext) -> &mut VisualTestContext {
    let handle: AnyWindowHandle = cx.update(|cx| {
        test_support::init(ThemeConfig::default(), None, cx);
        actions::init(cx);
        crate::plugins::Plugins::init(None, cx);
        crate::accounts::providers::Providers::init(cx);
        EventStore::global(cx).update(cx, |store, cx| {
            store.set_calendars(vec![calendar("work", "Work"), calendar("home", "Home")], cx);
        });
        super::open(cx);
        super::handle(cx).unwrap()
    });
    let cx = VisualTestContext::from_window(handle, cx).into_mut();
    cx.update(|window, _| window.activate_window());
    cx.run_until_parked();
    cx
}

fn settings_window(cx: &mut VisualTestContext) -> Entity<SettingsWindow> {
    cx.update(|window, _| {
        window
            .root::<gpui_kit::base::Root>()
            .flatten()
            .expect("a root")
    })
    .read_with(cx, |root, _| root.view().clone())
    .downcast::<SettingsWindow>()
    .unwrap()
}

fn show(tab: SettingsTab, cx: &mut VisualTestContext) {
    let window = settings_window(cx);
    cx.update(|w, cx| window.update(cx, |this, cx| this.select(tab, w, cx)));
    cx.run_until_parked();
}

fn page<T: 'static>(cx: &mut VisualTestContext) -> Entity<T> {
    let window = settings_window(cx);
    cx.update(|_, cx| window.read(cx).page().clone())
        .downcast::<T>()
        .unwrap()
}

fn click(selector: &'static str, cx: &mut VisualTestContext) {
    let bounds = cx
        .debug_bounds(selector)
        .unwrap_or_else(|| panic!("{selector} is not on screen"));
    cx.simulate_click(bounds.center(), Modifiers::default());
    cx.run_until_parked();
}

fn groups(cx: &mut VisualTestContext) -> std::collections::BTreeMap<String, Vec<String>> {
    cx.update(|_, cx| Settings::global(cx).rencal.groups.clone())
}

#[gpui_kit::test]
fn the_nav_opens_pages_and_escape_closes_the_window(cx: &mut TestAppContext) {
    let cx = open(cx);
    click("settings-tab-Calendars", cx);
    page::<CalendarsPage>(cx);
    click("settings-tab-Plugins", cx);
    page::<PluginsPage>(cx);

    cx.simulate_keystrokes("escape");
    cx.run_until_parked();
    assert!(cx.cx.windows().is_empty());
}

#[gpui_kit::test]
fn a_calendar_checkbox_shows_or_hides_it_in_the_group(cx: &mut TestAppContext) {
    let cx = open(cx);
    show(SettingsTab::Calendars, cx);

    click("calendar-home", cx);
    assert_eq!(groups(cx).get("default"), Some(&vec!["work".to_owned()]));
    // Showing every calendar again drops the default group.
    click("calendar-home", cx);
    assert!(groups(cx).is_empty());
}

#[gpui_kit::test]
fn a_new_group_is_validated_saved_and_selected(cx: &mut TestAppContext) {
    let cx = open(cx);
    show(SettingsTab::Calendars, cx);
    let page = page::<CalendarsPage>(cx);
    cx.update(|window, cx| page.update(cx, |page, cx| page.open_group_dialog(None, window, cx)));
    cx.run_until_parked();

    // "Default" is reserved: Enter does nothing.
    cx.simulate_input("Default");
    cx.simulate_keystrokes("enter");
    assert!(groups(cx).is_empty());
    assert!(cx.update(|window, cx| window.has_active_dialog(cx)));

    cx.simulate_keystrokes("ctrl-a backspace");
    cx.simulate_input("Focus");
    cx.simulate_keystrokes("enter");
    cx.run_until_parked();
    assert_eq!(
        groups(cx).get("Focus"),
        Some(&vec!["work".to_owned(), "home".to_owned()])
    );
    assert!(!cx.update(|window, cx| window.has_active_dialog(cx)));
    assert_eq!(
        page.read_with(cx, |page, _| page.selected_group().to_owned()),
        "Focus"
    );

    // The group's own list changes, not the default one.
    click("calendar-work", cx);
    assert_eq!(groups(cx).get("Focus"), Some(&vec!["home".to_owned()]));
    assert!(groups(cx).get("default").is_none());
}

fn entry(id: &str, name: &str, description: &str, stars: u32) -> PluginCatalogEntry {
    PluginCatalogEntry {
        id: id.into(),
        name: name.into(),
        repo: id.replace('.', "/"),
        description: description.into(),
        tag: "v1.10.0".into(),
        contributions: vec![ContributionKind::Theme],
        preview_url: None,
        stars,
        released_at: None,
    }
}

#[gpui_kit::test]
fn the_plugin_grid_opens_a_sheet_with_the_installed_state(cx: &mut TestAppContext) {
    let cx = open(cx);
    show(SettingsTab::Plugins, cx);
    let page = page::<PluginsPage>(cx);
    let installed = InstalledPlugin {
        id: "alice.dusk".into(),
        name: "Dusk".into(),
        description: None,
        contributions: Vec::new(),
        preview_url: None,
        repo: Some("alice/dusk".into()),
        local_dir: None,
        version: Some("v1.2.0".into()),
        update_version: Some("v1.10.0".into()),
        error: None,
    };
    cx.update(|_, cx| {
        page.update(cx, |page, cx| {
            page.set_lists(
                InstalledPlugins {
                    plugins: vec![installed],
                    errors: Vec::new(),
                },
                PluginCatalog {
                    plugins: vec![
                        entry("alice.dusk", "Dusk", "A quiet theme", 3),
                        entry("bob.dawn", "Dawn", "A bright theme", 12),
                    ],
                    error: None,
                },
                cx,
            )
        })
    });
    cx.run_until_parked();

    // Most starred first.
    let dawn = cx.debug_bounds("plugin-card:bob.dawn").unwrap();
    let dusk = cx.debug_bounds("plugin-card:alice.dusk").unwrap();
    assert!(dawn.left() < dusk.left());

    click("plugin-card:alice.dusk", cx);
    assert!(cx.update(|window, cx| window.has_active_sheet(cx)));
    let details = page
        .read_with(cx, |page, _| page.selected().cloned())
        .expect("the sheet's plugin");
    details.read_with(cx, |details, _| {
        let plugin = details.plugin_item();
        assert_eq!(plugin.id, "alice.dusk");
        assert_eq!(
            plugin.installed.as_ref().unwrap().update_version.as_deref(),
            Some("v1.10.0")
        );
    });
}
