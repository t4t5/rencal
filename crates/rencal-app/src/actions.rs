//! App actions and their key bindings (GPUI_PORT_PLAN.md §3.5). Phase 1 binds
//! the window-level ones; the rest of `src/lib/shortcuts.ts` arrives with the
//! views in Phase 3, as one table feeding the keymap, palette and tooltips.
//!
//! Single-character bindings live in the `CalendarView` key context only, so
//! text inputs never trigger them. `secondary` is cmd on macOS, ctrl elsewhere.

use gpui_kit::{App, KeyBinding, actions};

use crate::theme::ThemeStore;
use crate::ui_state::UiState;
use crate::windows::settings_window;

/// The key context of the calendar views (main window content).
pub const CALENDAR_VIEW_CONTEXT: &str = "CalendarView";

actions!(
    rencal,
    [
        ToggleSidebar,
        OpenSettings,
        ToggleTheme,
        ShowMonthView,
        ShowWeekView,
        ShowBoardView,
        /// Closes a secondary window (settings).
        CloseWindow,
        Quit,
    ]
);

pub fn init(cx: &mut App) {
    cx.bind_keys([
        KeyBinding::new("ctrl-b", ToggleSidebar, None),
        KeyBinding::new("secondary-,", OpenSettings, None),
        KeyBinding::new("secondary-shift-t", ToggleTheme, None),
        KeyBinding::new("m", ShowMonthView, Some(CALENDAR_VIEW_CONTEXT)),
        KeyBinding::new("w", ShowWeekView, Some(CALENDAR_VIEW_CONTEXT)),
        KeyBinding::new("b", ShowBoardView, Some(CALENDAR_VIEW_CONTEXT)),
        KeyBinding::new("escape", CloseWindow, Some(settings_window::KEY_CONTEXT)),
        #[cfg(target_os = "macos")]
        KeyBinding::new("cmd-q", Quit, None),
    ]);

    cx.on_action(|_: &ToggleSidebar, cx| {
        UiState::update(cx, |ui| ui.sidebar_collapsed = !ui.sidebar_collapsed);
    });
    cx.on_action(|_: &OpenSettings, cx| settings_window::open(cx));
    cx.on_action(|_: &ToggleTheme, cx| ThemeStore::cycle(cx));
    cx.on_action(|_: &ShowMonthView, cx| show_view("month", cx));
    cx.on_action(|_: &ShowWeekView, cx| show_view("week", cx));
    cx.on_action(|_: &ShowBoardView, cx| show_view("board", cx));
    cx.on_action(|_: &Quit, cx| cx.quit());
}

fn show_view(id: &str, cx: &mut App) {
    UiState::update(cx, |ui| ui.calendar_view = id.to_owned());
}
