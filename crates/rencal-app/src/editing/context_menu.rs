//! Right-click menus on events and days (ports of `EventContextMenu.tsx`,
//! `AllDayContextMenu.tsx`, `ScheduledDayContextMenu.tsx` and the month
//! cell's menu). One menu at a time, drawn by the main window at the
//! pointer; gpui-kit's `context_menu` can't be used because nested triggers
//! (an event inside a day cell) would both open.
//!
//! An event's block stays highlighted while its menu is open.

use gpui_kit::component::menu::{PopupMenu, PopupMenuItem};
use gpui_kit::{
    AnyElement, App, Bounds, DismissEvent, Entity, Focusable, Global, IntoElement, ParentElement,
    Pixels, Point, Subscription, Window, anchored, deferred, px,
};
use rencal_time::{CalendarEvent, EventKey};

use super::{can_create, commands, popover};
use crate::event_store::EventStore;
use crate::keymap::DuplicateEvent;

struct OpenMenu {
    menu: Entity<PopupMenu>,
    position: Point<Pixels>,
    /// The event whose menu this is.
    event: Option<EventKey>,
    _dismiss: Subscription,
}

#[derive(Default)]
struct ContextMenuState(Option<OpenMenu>);

impl Global for ContextMenuState {}

/// Opens a menu at `position` built by `build`.
fn open(
    position: Point<Pixels>,
    event: Option<EventKey>,
    window: &mut Window,
    cx: &mut App,
    build: impl Fn(PopupMenu, &mut Window, &mut gpui_kit::Context<PopupMenu>) -> PopupMenu + 'static,
) {
    let menu = PopupMenu::build(window, cx, build);
    if menu.read(cx).is_empty() {
        return;
    }
    let dismiss = window.subscribe(&menu, cx, |_, _: &DismissEvent, window, cx| {
        cx.set_global(ContextMenuState(None));
        window.refresh();
    });
    menu.read(cx).focus_handle(cx).focus(window, cx);
    cx.set_global(ContextMenuState(Some(OpenMenu {
        menu,
        position,
        event,
        _dismiss: dismiss,
    })));
    window.refresh();
}

/// The event whose menu is open (drawn highlighted).
pub fn highlighted(cx: &App) -> Option<EventKey> {
    cx.try_global::<ContextMenuState>()?
        .0
        .as_ref()?
        .event
        .clone()
}

/// The open menu, for the main window.
pub fn layer(cx: &App) -> Option<AnyElement> {
    let open = cx.try_global::<ContextMenuState>()?.0.as_ref()?;
    Some(
        deferred(
            anchored()
                .position(open.position)
                .snap_to_window_with_margin(px(8.))
                .child(open.menu.clone()),
        )
        .with_priority(gpui_kit::base::POPUP_PRIORITY)
        .into_any_element(),
    )
}

/// The menu of an event block: edit, duplicate, delete.
pub fn event_menu(
    event: &CalendarEvent,
    block: Option<Bounds<Pixels>>,
    position: Point<Pixels>,
    window: &mut Window,
    cx: &mut App,
) {
    let calendars = EventStore::global(cx).read(cx).calendars().clone();
    let writable = !event.is_readonly(&calendars);
    let can_duplicate = writable && can_create(cx);
    let event = event.clone();
    open(
        position,
        Some(event.key()),
        window,
        cx,
        move |menu, _, _| {
            let edit = event.key();
            let duplicate = event.clone();
            let delete = event.clone();
            let mut menu = menu.item(PopupMenuItem::new("Edit event").on_click(move |_, _, cx| {
                popover::open_event(edit.clone(), block, cx);
            }));
            if can_duplicate {
                menu = menu.item(
                    PopupMenuItem::new("Duplicate event")
                        .action(Box::new(DuplicateEvent))
                        .on_click(move |_, window, cx| {
                            commands::request_duplicate(duplicate.clone(), block, window, cx)
                        }),
                );
            }
            if writable {
                menu = menu.item(PopupMenuItem::new("Delete event").on_click(
                    move |_, window, cx| commands::request_delete(delete.clone(), window, cx),
                ));
            }
            menu
        },
    );
}

/// A day's menu: "Create event".
pub fn day_menu(
    position: Point<Pixels>,
    window: &mut Window,
    cx: &mut App,
    create: impl Fn(&mut Window, &mut App) + 'static,
) {
    let create = std::rc::Rc::new(create);
    open(position, None, window, cx, move |menu, _, _| {
        let create = create.clone();
        menu.item(
            PopupMenuItem::new("Create event").on_click(move |_, window, cx| create(window, cx)),
        )
    });
}

pub fn init(cx: &mut App) {
    cx.set_global(ContextMenuState::default());
}
