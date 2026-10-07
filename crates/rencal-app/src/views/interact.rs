//! Pointer handling the views share: event blocks open the popover at their
//! bounds, drag to reschedule and have a context menu; day backgrounds
//! navigate, create on double click or from their menu, and start drag to
//! create. Event blocks record themselves in `ui::anchors` so presses on
//! them never reach the background behind.

use chrono::NaiveDate;
use gpui_kit::{
    App, Bounds, ClickEvent, InteractiveElement, MouseButton, ParentElement, Pixels, Point,
    StatefulInteractiveElement, Window, point, px, size,
};
use rencal_time::CalendarEvent;

use crate::editing::drag::{self, FloatKind};
use crate::editing::{ClickGuard, context_menu, popover};
use crate::navigation::Navigation;
use crate::ui::anchors::{Anchors, EventSource, event_anchor};

/// Where a block's popover anchors.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AnchorAt {
    Block,
    /// At the click's x over the block's height: a bar filling the row
    /// would push a beside-it popover off screen (`pointAnchorFromClick`).
    Pointer,
}

/// Whether the click is the second of a double click.
pub fn is_double_click(event: &ClickEvent) -> bool {
    matches!(event, ClickEvent::Mouse(mouse) if mouse.down.click_count >= 2)
}

/// The popover anchor for a click on `event`'s block.
fn click_anchor(
    event: &CalendarEvent,
    position: Point<Pixels>,
    at: AnchorAt,
    cx: &App,
) -> Option<Bounds<Pixels>> {
    let block = Anchors::event_bounds(&event.key(), Some(position), cx)?;
    Some(match at {
        AnchorAt::Block => block,
        AnchorAt::Pointer => Bounds::new(
            point(position.x, block.top()),
            size(px(0.), block.size.height),
        ),
    })
}

/// Makes `element` an interactive event block. Drafts and drag previews are
/// stand-ins (`interactive` false): no click, menu or drag.
pub fn event_block<E>(
    element: E,
    event: &CalendarEvent,
    source: EventSource,
    drag: Option<FloatKind>,
    anchor_at: AnchorAt,
    interactive: bool,
) -> E
where
    E: InteractiveElement + StatefulInteractiveElement + ParentElement,
{
    if !interactive {
        return element;
    }
    let key = event.key();
    let element = element.child(event_anchor(key.clone(), source));
    let element = match drag {
        Some(kind) => {
            let event = event.clone();
            element.on_mouse_down(MouseButton::Left, move |e, window, cx| {
                drag::press_event(&event, kind, e.position, window, cx)
            })
        }
        None => element,
    };
    let menu_event = event.clone();
    let click_event = event.clone();
    element
        .on_mouse_down(MouseButton::Right, move |e, window, cx| {
            cx.stop_propagation();
            let block = Anchors::event_bounds(&menu_event.key(), Some(e.position), cx);
            context_menu::event_menu(&menu_event, block, e.position, window, cx);
        })
        .on_click(move |e, _, cx| {
            cx.stop_propagation();
            if ClickGuard::swallowed(cx) {
                return;
            }
            let anchor = click_anchor(&click_event, e.position(), anchor_at, cx);
            popover::toggle_event(click_event.key(), anchor, cx);
        })
}

/// A day background's click: navigate there, unless the click ends a drag
/// or closes the popover.
pub fn navigate_on_click(date: NaiveDate) -> impl Fn(&ClickEvent, &mut Window, &mut App) {
    move |_, _, cx| {
        if !ClickGuard::swallowed(cx) {
            Navigation::navigate_to(date, None, cx);
        }
    }
}

/// Opens the day menu ("Create event") unless the press is on an event.
pub fn day_menu(
    position: Point<Pixels>,
    window: &mut Window,
    cx: &mut App,
    create: impl Fn(&mut Window, &mut App) + 'static,
) {
    if Anchors::event_at(position, cx).is_some() {
        return;
    }
    context_menu::day_menu(position, window, cx, create);
}
