//! The main window (GPUI_PORT_PLAN.md §3.4): a collapsible sidebar (minical,
//! agenda) beside the main column (header + calendar view). Window-level
//! actions land here: the palettes, the shortcuts overlay and the agenda's
//! keyboard selection.
//!
//! Like the old `AppWindow.tsx`: below the `md` breakpoint the sidebar fills
//! the window and the main column is hidden; above it, the sidebar is 300px
//! and collapses with `ctrl-b`.

use gpui_kit::component::{h_flex, v_flex};
use gpui_kit::{
    AnyView, AnyWindowHandle, App, AppContext, Context, Entity, FocusHandle, Global,
    InteractiveElement, IntoElement, ParentElement, Pixels, Render, Styled, Subscription, Window,
    div, point, prelude::FluentBuilder, px, size,
};

use super::{drag_region, window_options};
use crate::actions::{CALENDAR_VIEW_CONTEXT, Dismiss, OpenSelected};
use crate::event_store::EventStore;
use crate::keymap::{GoToDate, NextEvent, PrevEvent, Search, ShowShortcuts, ToggleCommandPalette};
use crate::palette::{self, Page};
use crate::settings::Settings;
use crate::sidebar::{MACOS_TRAFFIC_LIGHTS_WIDTH, Sidebar};
use crate::sync_state::SyncState;
use crate::theme::{ThemeStore, appearance};
use crate::toolbar::{self, InvitesOpen};
use crate::ui::{Palette, metric};
use crate::ui_state::UiState;
use crate::{search, shortcuts_overlay, views};

/// Tailwind's `md`: below it the main column is hidden.
const MD_BREAKPOINT: Pixels = px(768.);
const SIDEBAR_WIDTH: Pixels = px(300.);

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
    sidebar: Entity<Sidebar>,
    /// The shown calendar view and its id; rebuilt when the id changes, so
    /// each switch opens on the active date like the old tabs did.
    view: Option<(&'static str, AnyView)>,
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
        let store = EventStore::global(cx);
        let subscriptions = vec![
            cx.observe_window_appearance(window, |_, window, cx| {
                ThemeStore::set_os_appearance(appearance(window.appearance()), cx);
            }),
            // Coming back to the window checks for remote changes.
            cx.observe_window_activation(window, |_, window, cx| {
                if window.is_window_active() {
                    SyncState::request(cx);
                }
            }),
            cx.observe_global::<UiState>(|_, cx| cx.notify()),
            cx.observe_global::<Settings>(|_, cx| cx.notify()),
            cx.observe_global::<SyncState>(|_, cx| cx.notify()),
            cx.observe_global::<InvitesOpen>(|_, cx| cx.notify()),
            cx.observe(&store, |_, _, cx| cx.notify()),
        ];
        Self {
            focus,
            sidebar: cx.new(|cx| Sidebar::new(window, cx)),
            view: None,
            _subscriptions: subscriptions,
        }
    }

    fn calendar_view(&mut self, id: &str, window: &mut Window, cx: &mut App) -> AnyView {
        let def = views::view_def(id);
        match &self.view {
            Some((shown, view)) if *shown == def.id => view.clone(),
            _ => {
                let view = views::build(def.id, window, cx);
                self.view = Some((def.id, view.clone()));
                view
            }
        }
    }

    fn with_agenda(
        &mut self,
        cx: &mut Context<Self>,
        f: impl FnOnce(
            &mut crate::sidebar::agenda::Agenda,
            &mut Context<crate::sidebar::agenda::Agenda>,
        ),
    ) {
        let agenda = self.sidebar.read(cx).agenda().clone();
        agenda.update(cx, f);
    }
}

impl Render for MainWindow {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let wide = window.viewport_size().width >= MD_BREAKPOINT;
        let ui = UiState::global(cx).clone();
        let calendar_view = self.calendar_view(&ui.calendar_view, window, cx);
        let theme = ThemeStore::active(cx);
        let palette = Palette::new(&theme);
        let show_sidebar = !wide || !ui.sidebar_collapsed;
        self.sidebar
            .update(cx, |sidebar, _| sidebar.set_narrow(!wide));

        h_flex()
            .id("main-window")
            .key_context(CALENDAR_VIEW_CONTEXT)
            .track_focus(&self.focus)
            .size_full()
            .overflow_hidden()
            .on_action(cx.listener(|_, _: &Search, window, cx| search::open(window, cx)))
            .on_action(cx.listener(|_, _: &ToggleCommandPalette, window, cx| {
                palette::toggle(Page::Root, window, cx)
            }))
            .on_action(
                cx.listener(|_, _: &GoToDate, window, cx| {
                    palette::open(Page::GoToDate, window, cx)
                }),
            )
            .on_action(
                cx.listener(|_, _: &ShowShortcuts, window, cx| shortcuts_overlay::open(window, cx)),
            )
            .on_action(cx.listener(|this, _: &NextEvent, _, cx| {
                this.with_agenda(cx, |agenda, cx| agenda.focus_item(1, cx))
            }))
            .on_action(cx.listener(|this, _: &PrevEvent, _, cx| {
                this.with_agenda(cx, |agenda, cx| agenda.focus_item(-1, cx))
            }))
            .on_action(cx.listener(|this, _: &Dismiss, _, cx| {
                this.with_agenda(cx, |agenda, cx| {
                    agenda.dismiss(cx);
                })
            }))
            .on_action(cx.listener(|this, _: &OpenSelected, _, cx| {
                this.with_agenda(cx, |agenda, cx| agenda.open_selected(cx))
            }))
            .when(show_sidebar, |this| {
                this.child(
                    div()
                        .id("sidebar")
                        .h_full()
                        .flex_shrink_0()
                        .overflow_hidden()
                        .map(|this| {
                            if wide {
                                this.w(SIDEBAR_WIDTH)
                                    .border_r_1()
                                    .border_color(palette.border)
                            } else {
                                this.w_full()
                            }
                        })
                        .bg(palette.sidebar)
                        .child(self.sidebar.clone()),
                )
            })
            .when(wide, |this| {
                this.child(
                    v_flex()
                        .flex_1()
                        .min_w_0()
                        .h_full()
                        .child(header(&ui, metric(&theme, "layout.padding"), cx))
                        .child(div().flex_1().min_h_0().child(calendar_view)),
                )
            })
    }
}

fn header(ui: &UiState, padding: Pixels, cx: &mut App) -> impl IntoElement + use<> {
    let invites = toolbar::invites_badge(cx);
    h_flex()
        .id("main-toolbar")
        .flex_shrink_0()
        .items_center()
        .gap_2()
        .p(padding)
        .when(cfg!(target_os = "macos") && ui.sidebar_collapsed, |this| {
            this.pl(px(MACOS_TRAFFIC_LIGHTS_WIDTH))
        })
        .when(ui.sidebar_collapsed, |this| {
            this.child(toolbar::show_sidebar_button())
        })
        .child(toolbar::today_button(cx))
        .child(toolbar::settings_button())
        .children(invites)
        .child(toolbar::sync_status(cx))
        .child(drag_region("header-drag").flex_1().h_full())
        .children(toolbar::group_switcher(cx))
        .child(toolbar::view_menu(cx))
        .child(toolbar::search_button())
}

#[cfg(test)]
mod tests {
    use gpui_kit::TestAppContext;
    use rencal_config::ThemeConfig;

    use super::*;
    use crate::keymap::OpenSettings;
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

    fn date(s: &str) -> chrono::NaiveDate {
        s.parse().unwrap()
    }

    fn active_date(cx: &mut TestAppContext) -> chrono::NaiveDate {
        cx.update(|cx| crate::navigation::Navigation::active_date(cx))
    }

    fn selected(cx: &mut TestAppContext) -> Option<String> {
        cx.update(|cx| {
            EventStore::global(cx)
                .read(cx)
                .selected_event()
                .map(|key| key.0.clone())
        })
    }

    #[gpui_kit::test]
    fn day_keys_jump_and_t_comes_back_to_today(cx: &mut TestAppContext) {
        let window = open_main(cx);
        cx.simulate_keystrokes(window, "l");
        assert_eq!(active_date(cx), date("2026-10-08"));
        cx.executor()
            .advance_clock(std::time::Duration::from_millis(100));
        cx.simulate_keystrokes(window, "t");
        assert_eq!(active_date(cx), date("2026-10-07"));
    }

    #[gpui_kit::test]
    fn tab_walks_the_agenda_rows_and_escape_lets_go(cx: &mut TestAppContext) {
        use crate::event_store::test_events::{all_day, timed};
        use rencal_time::event::DateRange;

        let window = open_main(cx);
        let utc = chrono_tz::UTC;
        cx.update(|cx| {
            EventStore::global(cx).update(cx, |store, cx| {
                store.set_test_events(
                    vec![
                        timed("late", "Late", "2026-10-07 15:00", "2026-10-07 16:00", utc),
                        timed(
                            "early",
                            "Early",
                            "2026-10-07 09:00",
                            "2026-10-07 10:00",
                            utc,
                        ),
                        all_day("trip", "Trip", "2026-10-07", "2026-10-08", utc),
                        timed(
                            "next",
                            "Tomorrow",
                            "2026-10-08 09:00",
                            "2026-10-08 10:00",
                            utc,
                        ),
                    ],
                    DateRange {
                        start: date("2026-08-01"),
                        end: date("2026-12-01"),
                    },
                    cx,
                )
            })
        });
        cx.run_until_parked();

        // Starts on the active date's first timed row, not the all-day chip.
        cx.simulate_keystrokes(window, "tab");
        assert_eq!(selected(cx).as_deref(), Some("work::early"));
        cx.simulate_keystrokes(window, "tab");
        assert_eq!(selected(cx).as_deref(), Some("work::late"));
        cx.simulate_keystrokes(window, "tab");
        assert_eq!(selected(cx).as_deref(), Some("work::next"));
        // The selection moves the active date with it.
        assert_eq!(active_date(cx), date("2026-10-08"));
        cx.simulate_keystrokes(window, "shift-tab");
        assert_eq!(selected(cx).as_deref(), Some("work::late"));

        cx.simulate_keystrokes(window, "enter");
        let active = cx.update(|cx| EventStore::global(cx).read(cx).active_event().cloned());
        assert_eq!(active.map(|k| k.0).as_deref(), Some("work::late"));
        // Escape closes the open event first, then drops the selection.
        cx.simulate_keystrokes(window, "escape");
        assert_eq!(selected(cx).as_deref(), Some("work::late"));
        cx.simulate_keystrokes(window, "escape");
        assert_eq!(selected(cx), None);
    }

    #[gpui_kit::test]
    fn the_palette_runs_a_command(cx: &mut TestAppContext) {
        let window = open_main(cx);
        cx.simulate_keystrokes(window, "secondary-k");
        cx.run_until_parked();
        cx.simulate_input(window, "week view");
        cx.run_until_parked();
        cx.simulate_keystrokes(window, "enter");
        cx.run_until_parked();
        assert_eq!(ui(cx).calendar_view, "week");
        // Focus is back on the calendar: its keys work again.
        cx.simulate_keystrokes(window, "m");
        assert_eq!(ui(cx).calendar_view, "month");
    }
}
