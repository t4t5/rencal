//! Editing (GPUI_PORT_PLAN.md Phase 4): everything that changes events.
//!
//! - `commands`: every event write (save, delete, duplicate, RSVP) with its
//!   optimistic update, rollback toast and recurrence-scope dialog
//!   (`dialogs`). Nothing else writes through the backend.
//! - `draft`: `DraftState`, the new event being composed (sidebar compose
//!   input, the new-event popover) and its create.
//! - `form`: `EventForm`, the event editor shared by the popover, the narrow
//!   sheet and the compose card; its inputs live in `fields`.
//! - `popover`: the event popover (edit or new), anchored to the event's
//!   block, or a sheet on narrow windows.
//! - `compose`: the sidebar compose input with magic segments, its card and
//!   the fly animation.
//! - `drag`: drag to reschedule and drag to create.
//! - `context_menu`: right-click menus on events and days.
//!
//! Geometry comes from `ui::anchors` (last frame's bounds), never from
//! hit-testing elements directly.

pub mod commands;
pub mod compose;
pub mod context_menu;
pub mod dialogs;
pub mod draft;
pub mod drag;
pub mod fields;
pub mod form;
pub mod popover;
#[cfg(test)]
mod tests;

use gpui_kit::component::WindowExt;
use gpui_kit::component::notification::Notification;
use gpui_kit::{App, Global, MouseDownEvent, Window};

use crate::event_store::EventStore;
use crate::ui::anchors::Anchors;
use crate::windows::{main_window, settings_window};

pub fn init(cx: &mut App) {
    Anchors::init(cx);
    cx.set_global(ClickGuard::default());
    context_menu::init(cx);
    draft::DraftState::init(cx);
    drag::DragState::init(cx);
    popover::init(cx);
}

/// Swallows the click that ends a drag or closes the event popover, so it
/// doesn't also land on the day under the pointer (the old
/// `suppressNextClick`). A click handler that navigates checks
/// `ClickGuard::swallowed` first.
///
/// Every mouse press starts a new generation (`begin_press`, from the main
/// window's capture listener); a swallow lasts until the next press, so a
/// listener that stops propagation can't leave it stuck.
#[derive(Default)]
pub struct ClickGuard {
    press: u64,
    swallowed: Option<u64>,
}

impl Global for ClickGuard {}

impl ClickGuard {
    pub fn begin_press(_: &MouseDownEvent, cx: &mut App) {
        let guard = cx.default_global::<Self>();
        guard.press += 1;
    }

    /// Swallows the click of the current press.
    pub fn swallow(cx: &mut App) {
        let guard = cx.default_global::<Self>();
        guard.swallowed = Some(guard.press);
    }

    pub fn swallowed(cx: &App) -> bool {
        cx.try_global::<Self>()
            .is_some_and(|guard| guard.swallowed == Some(guard.press))
    }
}

/// An error toast in the main window (the old `toast.error(title, {
/// description })`).
pub fn toast_error(title: &str, message: impl Into<String>, cx: &mut App) {
    let note = Notification::error(message.into()).title(title.to_owned());
    with_main_window(cx, move |window, cx| window.push_notification(note, cx));
}

pub fn with_main_window(cx: &mut App, f: impl FnOnce(&mut Window, &mut App)) {
    if let Some(handle) = main_window::handle(cx) {
        handle.update(cx, |_, window, cx| f(window, cx)).ok();
    }
}

/// Whether there is a calendar to create events in (`CreateEventGate`).
pub fn can_create(cx: &App) -> bool {
    EventStore::global(cx)
        .read(cx)
        .calendars()
        .iter()
        .any(|calendar| calendar.read_only != Some(true))
}

/// Without a writable calendar, creating asks to connect one. The accounts
/// page arrives with Settings (Phase 5); until then this opens the settings
/// window.
pub fn prompt_to_connect(cx: &mut App) {
    settings_window::open(cx);
}
