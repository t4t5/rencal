//! The settings window (GPUI_PORT_PLAN.md §3.4): a second, single-instance
//! window with a page list (General, Accounts, Calendars, Reminders, Themes,
//! Plugins). Like the old `SettingsWindow.tsx`: 800×500, fixed size, closes
//! on Escape. Each page is its own view, built fresh when its tab opens, as
//! the old tabs unmounted inactive pages.

mod accounts;
mod calendar_dialogs;
mod calendars;
mod controls;
mod general;
mod groups;
mod plugins;
mod reminders;
#[cfg(test)]
mod tests;
mod themes;

use gpui_kit::component::button::{Button, ButtonVariants};
use gpui_kit::component::{IconName, Sizable, h_flex, v_flex};
use gpui_kit::{
    AnyView, AnyWindowHandle, App, AppContext, ClickEvent, Context, FocusHandle, Global,
    InteractiveElement, IntoElement, ParentElement, Pixels, Render, StatefulInteractiveElement,
    Styled, Window, div, prelude::FluentBuilder, px, size,
};
use rencal_theme::ResolvedTheme;

use super::{MACOS_TITLE_BAR_HEIGHT, default_traffic_lights, drag_region, window_options};
use crate::actions::CloseWindow;
use crate::assets::RenIcon;
use crate::theme::{ActiveRenTheme, ThemeStore, hsla};

pub const KEY_CONTEXT: &str = "SettingsWindow";
const NAV_WIDTH: Pixels = px(200.);

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum SettingsTab {
    #[default]
    General,
    Accounts,
    Calendars,
    Reminders,
    Themes,
    Plugins,
}

impl SettingsTab {
    const ALL: [SettingsTab; 6] = [
        Self::General,
        Self::Accounts,
        Self::Calendars,
        Self::Reminders,
        Self::Themes,
        Self::Plugins,
    ];

    fn label(self) -> &'static str {
        match self {
            Self::General => "General",
            Self::Accounts => "Accounts",
            Self::Calendars => "Calendars",
            Self::Reminders => "Reminders",
            Self::Themes => "Themes",
            Self::Plugins => "Plugins",
        }
    }

    fn icon(self) -> RenIcon {
        match self {
            Self::General => RenIcon::Settings,
            Self::Accounts => RenIcon::User,
            Self::Calendars => RenIcon::Calendar,
            Self::Reminders => RenIcon::Bell,
            Self::Themes => RenIcon::Palette,
            Self::Plugins => RenIcon::Plugin,
        }
    }

    fn page(self, window: &mut Window, cx: &mut App) -> AnyView {
        match self {
            Self::General => cx.new(general::GeneralPage::new).into(),
            Self::Accounts => cx.new(accounts::AccountsPage::new).into(),
            Self::Calendars => cx.new(calendars::CalendarsPage::new).into(),
            Self::Reminders => cx
                .new(|cx| reminders::RemindersPage::new(window, cx))
                .into(),
            Self::Themes => cx.new(themes::ThemesPage::new).into(),
            Self::Plugins => cx.new(|cx| plugins::PluginsPage::new(window, cx)).into(),
        }
    }
}

struct SettingsWindowHandle(AnyWindowHandle);

impl Global for SettingsWindowHandle {}

#[cfg(test)]
pub fn handle(cx: &App) -> Option<AnyWindowHandle> {
    cx.try_global::<SettingsWindowHandle>()
        .map(|handle| handle.0)
}

/// Focuses the settings window, opening it first if it is closed.
pub fn open(cx: &mut App) {
    if let Some(SettingsWindowHandle(handle)) = cx.try_global::<SettingsWindowHandle>()
        && handle
            .update(cx, |_, window, _| window.activate_window())
            .is_ok()
    {
        return;
    }
    let options = gpui_kit::WindowOptions {
        is_resizable: false,
        ..window_options(size(px(800.), px(500.)), None, default_traffic_lights(), cx)
    };
    match gpui_kit::open_window(options, cx, |window, cx| {
        cx.new(|cx| SettingsWindow::new(window, cx))
    }) {
        Ok((handle, _)) => cx.set_global(SettingsWindowHandle(handle)),
        Err(err) => log::error!("could not open the settings window: {err}"),
    }
}

pub struct SettingsWindow {
    tab: SettingsTab,
    page: AnyView,
    focus: FocusHandle,
}

impl SettingsWindow {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        window.set_window_title("Settings");
        let focus = cx.focus_handle();
        window.focus(&focus, cx);
        cx.observe_global::<ThemeStore>(|_, cx| cx.notify())
            .detach();
        let tab = SettingsTab::default();
        Self {
            tab,
            page: tab.page(window, cx),
            focus,
        }
    }

    pub fn select(&mut self, tab: SettingsTab, window: &mut Window, cx: &mut Context<Self>) {
        if tab != self.tab {
            self.tab = tab;
            self.page = tab.page(window, cx);
            cx.notify();
        }
    }

    #[cfg(test)]
    pub fn page(&self) -> &AnyView {
        &self.page
    }
}

impl Render for SettingsWindow {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.ren_theme();
        let macos = cfg!(target_os = "macos");

        v_flex()
            .id("settings-window")
            .key_context(KEY_CONTEXT)
            .track_focus(&self.focus)
            .on_action(|_: &CloseWindow, window, _| window.remove_window())
            .size_full()
            .when(macos, |this| {
                this.child(
                    drag_region("settings-drag")
                        .w_full()
                        .h(MACOS_TITLE_BAR_HEIGHT)
                        .flex_shrink_0()
                        .border_b_1()
                        .border_color(hsla(theme.color("border"))),
                )
            })
            .when(!macos, |this| {
                this.child(
                    div().absolute().top(px(3.)).right_2().child(
                        Button::new("settings-close")
                            .ghost()
                            .small()
                            .icon(IconName::Close)
                            .tooltip_with_action("Close", &CloseWindow, Some(KEY_CONTEXT))
                            .on_click(|_, window, _| window.remove_window()),
                    ),
                )
            })
            .child(
                h_flex()
                    .flex_1()
                    .min_h_0()
                    .child(self.nav(theme, cx))
                    .child(
                        div()
                            .id("settings-page")
                            .flex()
                            .flex_1()
                            .min_w_0()
                            .h_full()
                            .child(self.page.clone()),
                    ),
            )
    }
}

impl SettingsWindow {
    fn nav(&self, theme: &ResolvedTheme, cx: &Context<Self>) -> impl IntoElement {
        let padding = px(theme.number("layout.padding") as f32);
        v_flex()
            .id("settings-nav")
            .w(NAV_WIDTH)
            .h_full()
            .flex_shrink_0()
            .gap_1()
            .px_2()
            .py(padding)
            .border_r_1()
            .border_color(hsla(theme.color("border")))
            .bg(hsla(theme.color("sidebar.background")))
            .children(SettingsTab::ALL.into_iter().map(|tab| {
                let selected = tab == self.tab;
                h_flex()
                    .id(tab.label())
                    .debug_selector(move || format!("settings-tab-{}", tab.label()))
                    .items_center()
                    .gap_2()
                    .px_2()
                    .h(px(theme.number("control.height") as f32))
                    .rounded(px(theme.radius_step(1.0) as f32))
                    .text_sm()
                    .map(|this| {
                        if selected {
                            this.bg(hsla(theme.color("element.selected")))
                                .text_color(hsla(theme.color("element.selected.text")))
                        } else {
                            this.text_color(hsla(theme.color("text.muted")))
                                .hover(|this| this.bg(hsla(theme.color("ghost_element.hover"))))
                        }
                    })
                    .child(gpui_kit::component::Icon::new(tab.icon()).small())
                    .child(tab.label())
                    .on_click(cx.listener(move |this, _: &ClickEvent, window, cx| {
                        this.select(tab, window, cx)
                    }))
            }))
    }
}
