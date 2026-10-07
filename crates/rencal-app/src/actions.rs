//! Key bindings and the app-level action handlers (GPUI_PORT_PLAN.md §3.5).
//! The actions and their keys come from the shortcut table in `keymap.rs`;
//! actions that need a window (palettes, overlays, the agenda) are handled by
//! the main window.
//!
//! Single-character and calendar-moving bindings live in the `CalendarView`
//! key context outside text inputs (`CalendarView && !Input`), so typing never
//! triggers them; `keymap::is_global` names the few that work everywhere.
//! While an event is open (`event_open`) only the shortcuts that leave it
//! alone (`allow_while_event_open`) work, like the old `lockBackground`.

use std::rc::Rc;
use std::time::{Duration, Instant};

use chrono::{Datelike, Duration as Days, NaiveDate};
use gpui_kit::{App, BorrowAppContext, DummyKeyboardMapper, Global, KeyBinding, actions};
use rencal_text::calendar_groups::group_options;
use rencal_time::day::add_months_to_month_start;

pub use crate::keymap::*;

use crate::clock::Clock;
use crate::event_store::EventStore;
use crate::navigation::Navigation;
use crate::settings::Settings;
use crate::sync_state::SyncState;
use crate::theme::ThemeStore;
use crate::ui_state::UiState;
use crate::windows::settings_window;

/// The key context of the calendar views (main window content).
pub const CALENDAR_VIEW_CONTEXT: &str = "CalendarView";
/// Set on the calendar context while the event popover is open.
pub const EVENT_OPEN: &str = "event_open";

/// Keyboard navigation repeats no faster than this.
const NAV_THROTTLE: Duration = Duration::from_millis(80);

actions!(
    rencal,
    [
        /// Closes a secondary window (settings).
        CloseWindow,
        Quit,
        /// `Escape` in the calendar: closes the open event, else drops the
        /// agenda's keyboard selection.
        Dismiss,
        /// `Enter` in the calendar: opens the agenda's selected event.
        OpenSelected,
        /// `Tab` / `Shift-Tab` from the calendar while an event is open:
        /// focus moves into the popover.
        EnterPopover,
        EnterPopoverBackward,
        /// `Delete` / `Backspace` while an event is open and no field has
        /// focus.
        DeleteOpenEvent,
        /// `Delete` / `Backspace` on the agenda's selected row.
        DeleteSelected,
    ]
);

pub fn init(cx: &mut App) {
    bind_keys(cx);

    cx.on_action(|_: &ToggleSidebar, cx| {
        UiState::update(cx, |ui| ui.sidebar_collapsed = !ui.sidebar_collapsed);
    });
    cx.on_action(|_: &OpenSettings, cx| settings_window::open(cx));
    cx.on_action(|_: &ToggleTheme, cx| ThemeStore::cycle(cx));
    cx.on_action(|_: &ShowMonthView, cx| show_view("month", cx));
    cx.on_action(|_: &ShowWeekView, cx| show_view("week", cx));
    cx.on_action(|_: &ShowBoardView, cx| show_view("board", cx));
    cx.on_action(|_: &SwitchGroup, cx| switch_group(cx));
    cx.on_action(|_: &ToggleWeekNumbers, cx| {
        let next = !Settings::global(cx).rencal.show_week_numbers;
        Settings::update_rencal(cx, move |config| config.show_week_numbers = next);
    });
    cx.on_action(|_: &SyncNow, cx| SyncState::sync_now(cx));
    cx.on_action(|_: &Quit, cx| cx.quit());

    cx.on_action(|_: &GoToToday, cx| {
        clear_agenda_selection(cx);
        Navigation::navigate_to(Clock::global(cx).today, None, cx);
    });
    cx.on_action(|_: &NextDay, cx| step(cx, |date| date + Days::days(1)));
    cx.on_action(|_: &PrevDay, cx| step(cx, |date| date - Days::days(1)));
    cx.on_action(|_: &NextWeek, cx| step(cx, |date| date + Days::days(7)));
    cx.on_action(|_: &PrevWeek, cx| step(cx, |date| date - Days::days(7)));
    cx.on_action(|_: &NextMonth, cx| step(cx, |date| add_months_to_month_start(date, 1)));
    cx.on_action(|_: &PrevMonth, cx| step(cx, previous_month_start));
}

fn predicate(source: &str) -> Rc<gpui_kit::KeyBindingContextPredicate> {
    Rc::new(gpui_kit::KeyBindingContextPredicate::parse(source).expect("a valid key context"))
}

fn bind_keys(cx: &mut App) {
    let calendar = predicate(&format!("{CALENDAR_VIEW_CONTEXT} && !Input"));
    let calendar_locked = predicate(&format!(
        "{CALENDAR_VIEW_CONTEXT} && !Input && !{EVENT_OPEN}"
    ));
    let global_locked = predicate(&format!("!{EVENT_OPEN}"));
    let mut bindings = Vec::new();
    for shortcut in SHORTCUTS {
        for binding in shortcut.bindings {
            let context = match (
                is_global(binding, shortcut.id),
                shortcut.allow_while_event_open,
            ) {
                (true, true) => None,
                (true, false) => Some(global_locked.clone()),
                (false, true) => Some(calendar.clone()),
                (false, false) => Some(calendar_locked.clone()),
            };
            match KeyBinding::load(
                &keystroke(binding.keys),
                (shortcut.action)(),
                context,
                false,
                None,
                &DummyKeyboardMapper,
            ) {
                Ok(key_binding) => bindings.push(key_binding),
                Err(err) => log::error!("shortcut {}: {err:?}", shortcut.id),
            }
        }
    }
    let calendar_context = format!("{CALENDAR_VIEW_CONTEXT} && !Input");
    let calendar_closed = format!("{CALENDAR_VIEW_CONTEXT} && !Input && !{EVENT_OPEN}");
    let open_outside_popover = format!(
        "{CALENDAR_VIEW_CONTEXT} && {EVENT_OPEN} && !Input && !{}",
        crate::editing::popover::KEY_CONTEXT
    );
    bindings.extend([
        KeyBinding::new("escape", CloseWindow, Some(settings_window::KEY_CONTEXT)),
        KeyBinding::new("escape", Dismiss, Some(&calendar_context)),
        KeyBinding::new("enter", OpenSelected, Some(&calendar_context)),
        KeyBinding::new("tab", EnterPopover, Some(&open_outside_popover)),
        KeyBinding::new(
            "shift-tab",
            EnterPopoverBackward,
            Some(&open_outside_popover),
        ),
        KeyBinding::new("delete", DeleteOpenEvent, Some(&open_outside_popover)),
        KeyBinding::new("backspace", DeleteOpenEvent, Some(&open_outside_popover)),
        KeyBinding::new("delete", DeleteSelected, Some(&calendar_closed)),
        KeyBinding::new("backspace", DeleteSelected, Some(&calendar_closed)),
    ]);
    #[cfg(target_os = "macos")]
    bindings.push(KeyBinding::new("cmd-q", Quit, None));
    cx.bind_keys(bindings);
}

fn show_view(id: &str, cx: &mut App) {
    UiState::update(cx, |ui| ui.calendar_view = id.to_owned());
}

/// The next calendar group (`g`); nothing with fewer than two.
fn switch_group(cx: &mut App) {
    let options = group_options(&Settings::global(cx).rencal.groups);
    if options.len() < 2 {
        return;
    }
    let active = &UiState::global(cx).active_group;
    let next = match options.iter().position(|name| name == active) {
        Some(index) => options[(index + 1) % options.len()].clone(),
        None => options[0].clone(),
    };
    UiState::update(cx, |ui| ui.active_group = next);
}

/// The 1st of the active month, or of the previous month when already there.
fn previous_month_start(date: NaiveDate) -> NaiveDate {
    let month_start = date.with_day(1).expect("the 1st exists");
    if date == month_start {
        add_months_to_month_start(date, -1)
    } else {
        month_start
    }
}

#[derive(Default)]
struct NavThrottle(Option<Instant>);

impl Global for NavThrottle {}

/// A throttled keyboard jump from the active date.
fn step(cx: &mut App, to: impl FnOnce(NaiveDate) -> NaiveDate) {
    let now = Instant::now();
    let last = cx.default_global::<NavThrottle>().0;
    if last.is_some_and(|last| now.duration_since(last) < NAV_THROTTLE) {
        return;
    }
    cx.update_global::<NavThrottle, _>(|throttle, _| throttle.0 = Some(now));
    clear_agenda_selection(cx);
    let date = to(Navigation::active_date(cx));
    Navigation::navigate_to(date, None, cx);
}

/// Keyboard navigation hands the selection back from the agenda.
fn clear_agenda_selection(cx: &mut App) {
    let store = EventStore::global(cx);
    store.update(cx, |store, cx| store.set_selected_event(None, cx));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn previous_month_goes_to_the_1st_first() {
        let date = |s: &str| s.parse::<NaiveDate>().unwrap();
        assert_eq!(previous_month_start(date("2026-10-07")), date("2026-10-01"));
        assert_eq!(previous_month_start(date("2026-10-01")), date("2026-09-01"));
        assert_eq!(previous_month_start(date("2026-01-01")), date("2025-12-01"));
    }
}
