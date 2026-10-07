//! The main window (GPUI_PORT_PLAN.md §3.4): a collapsible sidebar beside the
//! main column (header + calendar view). Phase 1 is the frame only; the
//! sidebar sections and the views arrive in Phase 3.
//!
//! Like the old `AppWindow.tsx`: below the `md` breakpoint the sidebar fills
//! the window and the main column is hidden; above it, the sidebar is 300px
//! and collapses with `ctrl-b`.

use gpui_kit::component::button::{Button, ButtonVariants};
use gpui_kit::component::menu::DropdownMenu;
use gpui_kit::component::{Disableable, IconName, h_flex, v_flex};
use gpui_kit::{
    Anchor, AnyWindowHandle, App, AppContext, Context, FocusHandle, Global, InteractiveElement,
    IntoElement, ParentElement, Pixels, Render, SharedString, Styled, Subscription, Window, div,
    point, prelude::FluentBuilder, px, size,
};
use rencal_theme::ResolvedTheme;

use super::{drag_region, window_options};
use crate::actions::{
    CALENDAR_VIEW_CONTEXT, OpenSettings, ShowBoardView, ShowMonthView, ShowWeekView, ToggleSidebar,
};
use crate::theme::{ActiveRenTheme, ThemeStore, appearance, hsla};
use crate::ui_state::UiState;

/// Tailwind's `md`: below it the main column is hidden.
const MD_BREAKPOINT: Pixels = px(768.);
const SIDEBAR_WIDTH: Pixels = px(300.);
/// The macOS traffic lights sit left of the sidebar toolbar.
const MACOS_TRAFFIC_LIGHTS_WIDTH: Pixels = px(78.);

/// The calendar views, in menu order: `(id, name, action)`. Ids are what
/// `UiState::calendar_view` stores.
const VIEWS: [(&str, &str, &dyn gpui_kit::Action); 3] = [
    ("week", "Week", &ShowWeekView),
    ("month", "Month", &ShowMonthView),
    ("board", "Board", &ShowBoardView),
];

struct MainWindowHandle(AnyWindowHandle);

impl Global for MainWindowHandle {}

pub fn open(cx: &mut App) -> anyhow::Result<()> {
    let options = window_options(
        size(px(1200.), px(800.)),
        Some(size(px(300.), px(600.))),
        point(px(16.), px(30.)),
        cx,
    );
    let (handle, _) = gpui_kit::open_window(options, cx, |window, cx| {
        cx.new(|cx| MainWindow::new(window, cx))
    })?;
    cx.set_global(MainWindowHandle(handle));
    Ok(())
}

pub fn handle(cx: &App) -> Option<AnyWindowHandle> {
    cx.try_global::<MainWindowHandle>().map(|handle| handle.0)
}

/// Brings the main window forward. False when there is none to show.
pub fn show(cx: &mut App) -> bool {
    let Some(handle) = handle(cx) else {
        return false;
    };
    handle
        .update(cx, |_, window, _| window.activate_window())
        .is_ok()
}

pub struct MainWindow {
    focus: FocusHandle,
    _subscriptions: Vec<Subscription>,
}

impl MainWindow {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let focus = cx.focus_handle();
        window.focus(&focus, cx);
        // Syncing themes follow this window's appearance (the OS's).
        cx.defer_in(window, |_, window, cx| {
            ThemeStore::set_os_appearance(appearance(window.appearance()), cx);
        });
        let subscriptions = vec![
            cx.observe_window_appearance(window, |_, window, cx| {
                ThemeStore::set_os_appearance(appearance(window.appearance()), cx);
            }),
            cx.observe_global::<UiState>(|_, cx| cx.notify()),
        ];
        Self {
            focus,
            _subscriptions: subscriptions,
        }
    }
}

impl Render for MainWindow {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let wide = window.viewport_size().width >= MD_BREAKPOINT;
        let ui = UiState::global(cx).clone();
        let theme = cx.ren_theme();
        let show_sidebar = !wide || !ui.sidebar_collapsed;

        h_flex()
            .id("main-window")
            .key_context(CALENDAR_VIEW_CONTEXT)
            .track_focus(&self.focus)
            .size_full()
            .overflow_hidden()
            .when(show_sidebar, |this| {
                this.child(sidebar(wide, window.is_fullscreen(), theme))
            })
            .when(wide, |this| {
                this.child(
                    v_flex()
                        .flex_1()
                        .min_w_0()
                        .h_full()
                        .child(header(&ui, theme))
                        .child(view_placeholder(&ui, theme, cx)),
                )
            })
    }
}

fn padding(theme: &ResolvedTheme) -> Pixels {
    px(theme.number("layout.padding") as f32)
}

/// A button label in the theme's button typography.
fn button_label(theme: &ResolvedTheme, label: &str) -> SharedString {
    theme
        .transform("typography.button.transform")
        .apply(label)
        .into()
}

fn sidebar(wide: bool, fullscreen: bool, theme: &ResolvedTheme) -> impl IntoElement {
    let muted = hsla(theme.color("text.muted"));
    let section = |id: &'static str, label: &'static str| {
        div()
            .id(id)
            .px(padding(theme))
            .py_2()
            .text_sm()
            .text_color(muted)
            .child(label)
    };
    v_flex()
        .id("sidebar")
        .h_full()
        .flex_shrink_0()
        .overflow_hidden()
        .map(|this| {
            if wide {
                this.w(SIDEBAR_WIDTH)
            } else {
                this.w_full()
            }
        })
        .when(wide, |this| {
            this.border_r_1().border_color(hsla(theme.color("border")))
        })
        .bg(hsla(theme.color("sidebar.background")))
        .child(
            h_flex()
                .id("sidebar-toolbar")
                .items_center()
                .gap_2()
                .p(padding(theme))
                .when(cfg!(target_os = "macos") && !fullscreen && !wide, |this| {
                    this.pl(MACOS_TRAFFIC_LIGHTS_WIDTH)
                })
                .child(drag_region("sidebar-drag").flex_1().h(px(34.)))
                .child(
                    Button::new("compose")
                        .primary()
                        .label(button_label(theme, "New event"))
                        .disabled(true),
                ),
        )
        .child(section("minical", "Minical"))
        .child(section("agenda", "Agenda").flex_1())
}

fn header(ui: &UiState, theme: &ResolvedTheme) -> impl IntoElement {
    let current = VIEWS
        .iter()
        .find(|(id, ..)| *id == ui.calendar_view)
        .map_or("View", |(_, name, _)| name);
    let selected = ui.calendar_view.clone();

    h_flex()
        .id("main-toolbar")
        .flex_shrink_0()
        .items_center()
        .gap_2()
        .p(padding(theme))
        .when(cfg!(target_os = "macos") && ui.sidebar_collapsed, |this| {
            this.pl(MACOS_TRAFFIC_LIGHTS_WIDTH)
        })
        .when(ui.sidebar_collapsed, |this| {
            this.child(
                Button::new("show-sidebar")
                    .ghost()
                    .icon(IconName::PanelLeftOpen)
                    .tooltip_with_action("Show sidebar", &ToggleSidebar, None)
                    .on_click(|_, window, cx| window.dispatch_action(Box::new(ToggleSidebar), cx)),
            )
        })
        .child(
            Button::new("today")
                .secondary()
                .label(button_label(theme, "Today"))
                .disabled(true),
        )
        .child(
            Button::new("settings")
                .ghost()
                .icon(IconName::Settings)
                .tooltip_with_action("Settings", &OpenSettings, None)
                .on_click(|_, window, cx| window.dispatch_action(Box::new(OpenSettings), cx)),
        )
        .child(drag_region("header-drag").flex_1().h_full())
        .child(
            Button::new("calendar-view")
                .outline()
                .label(button_label(theme, current))
                .dropdown_menu_with_anchor(Anchor::TopRight, move |menu, _, _| {
                    VIEWS.iter().fold(menu, |menu, (id, name, action)| {
                        menu.menu_with_check(*name, *id == selected, action.boxed_clone())
                    })
                }),
        )
        .child(
            Button::new("search")
                .ghost()
                .icon(IconName::Search)
                .disabled(true),
        )
}

fn view_placeholder(ui: &UiState, theme: &ResolvedTheme, cx: &App) -> impl IntoElement {
    let name = VIEWS
        .iter()
        .find(|(id, ..)| *id == ui.calendar_view)
        .map_or("Month", |(_, name, _)| name);
    let store = ThemeStore::global(cx);
    v_flex()
        .id("main-viewport")
        .flex_1()
        .min_h_0()
        .items_center()
        .justify_center()
        .gap_1()
        .child(div().text_lg().child(format!("{name} view")))
        .child(
            div()
                .text_sm()
                .text_color(hsla(theme.color("text.muted")))
                .child(format!("Theme: {} ({})", theme.name, store.active_id())),
        )
}

#[cfg(test)]
mod tests {
    use gpui_kit::TestAppContext;
    use rencal_config::ThemeConfig;

    use super::*;
    use crate::{actions, test_support};

    fn open_main(cx: &mut TestAppContext) -> AnyWindowHandle {
        cx.update(|cx| {
            test_support::init(ThemeConfig::default(), None, cx);
            actions::init(cx);
            open(cx).unwrap();
            handle(cx).unwrap()
        })
    }

    fn ui(cx: &mut TestAppContext) -> UiState {
        cx.update(|cx| UiState::global(cx).clone())
    }

    #[gpui_kit::test]
    fn view_keys_switch_the_view_and_ctrl_b_collapses_the_sidebar(cx: &mut TestAppContext) {
        let window = open_main(cx);
        assert_eq!(ui(cx).calendar_view, "month");

        cx.simulate_keystrokes(window, "w");
        assert_eq!(ui(cx).calendar_view, "week");
        cx.simulate_keystrokes(window, "b");
        assert_eq!(ui(cx).calendar_view, "board");

        cx.simulate_keystrokes(window, "ctrl-b");
        assert!(ui(cx).sidebar_collapsed);
        cx.simulate_keystrokes(window, "ctrl-b");
        assert!(!ui(cx).sidebar_collapsed);
    }

    #[gpui_kit::test]
    fn settings_open_once(cx: &mut TestAppContext) {
        let window = open_main(cx);

        cx.dispatch_action(window, OpenSettings);
        cx.run_until_parked();
        assert_eq!(cx.windows().len(), 2);

        cx.dispatch_action(window, OpenSettings);
        cx.run_until_parked();
        assert_eq!(cx.windows().len(), 2);
    }
}
