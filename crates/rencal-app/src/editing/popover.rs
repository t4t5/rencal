//! The event popover (GPUI_PORT_PLAN.md §6.3, ports of `PopoverEditEvent`,
//! `PopoverNewEvent`, `SheetInfo` and `useEventPopoverTabTrap`).
//!
//! - It shows the open event (`EventStore::active_event`) or the new-event
//!   draft (`DraftState::is_popover_open`), never both. Switching events
//!   saves the previous one (`EventForm::finish`).
//! - It anchors beside the block that opened it (right, centred, flipped
//!   left when there's no room), at a bounds snapshot taken when it opens:
//!   `open_event` passes the clicked block, otherwise the event's block from
//!   `ui::anchors`, else the window's middle.
//! - A press outside closes it and swallows the click, except on an event
//!   block (whose own click switches or closes it) or while a menu, list or
//!   dialog is open over it. Escape closes it.
//! - Tab from the calendar enters it at the title; Tab inside cycles within
//!   it (a focus trap).
//! - Below the `md` breakpoint the open event is a sheet on the right
//!   instead, and there is no new-event popover.

use gpui_kit::base::FocusTrapElement;
use gpui_kit::component::{GlobalState, WindowExt};
use gpui_kit::{
    Anchor, App, AppContext, Bounds, BoxShadow, Context, Entity, FocusHandle, Global,
    InteractiveElement, IntoElement, KeyBinding, ParentElement, Pixels, Render,
    StatefulInteractiveElement, Styled, Subscription, Window, actions, anchored, deferred, div,
    point, px, size,
};
use rencal_time::EventKey;

use super::ClickGuard;
use super::draft::DraftState;
use super::form::{EventForm, FormEvent, FormKind};
use crate::event_store::EventStore;
use crate::theme::ThemeStore;
use crate::ui::anchors::{Anchors, Named};
use crate::ui::{color, radius};
use crate::windows::drag_region;

pub const KEY_CONTEXT: &str = "EventPopover";
const WIDTH: Pixels = px(350.);
const SIDE_OFFSET: Pixels = px(8.);
const COLLISION_PADDING: Pixels = px(16.);
const SHEET_MAX_WIDTH: Pixels = px(384.);

actions!(
    rencal,
    [
        /// Escape in the event popover.
        ClosePopover,
    ]
);

pub fn init(cx: &mut App) {
    cx.bind_keys([KeyBinding::new("escape", ClosePopover, Some(KEY_CONTEXT))]);
}

/// The block an event is about to open from (`setEventAnchor`).
struct PendingAnchor(EventKey, Bounds<Pixels>);

impl Global for PendingAnchor {}

/// Opens (or closes, when already open) `key`, anchored at `anchor`.
pub fn toggle_event(key: EventKey, anchor: Option<Bounds<Pixels>>, cx: &mut App) {
    if let Some(anchor) = anchor {
        cx.set_global(PendingAnchor(key.clone(), anchor));
    }
    EventStore::global(cx).update(cx, |store, cx| store.toggle_active_event(key, cx));
}

/// Opens `key`, anchored at `anchor`.
pub fn open_event(key: EventKey, anchor: Option<Bounds<Pixels>>, cx: &mut App) {
    if let Some(anchor) = anchor {
        cx.set_global(PendingAnchor(key.clone(), anchor));
    }
    EventStore::global(cx).update(cx, |store, cx| store.set_active_event(Some(key), cx));
}

#[derive(Clone, Debug, PartialEq)]
enum Target {
    Event(EventKey),
    Draft,
}

pub struct EventPopover {
    target: Option<Target>,
    form: Option<Entity<EventForm>>,
    anchor: Option<Bounds<Pixels>>,
    focus: FocusHandle,
    narrow: bool,
    _subscriptions: Vec<Subscription>,
}

/// The main window's popover (tests reach it through this).
#[cfg(test)]
struct EventPopoverHandle(gpui_kit::WeakEntity<EventPopover>);

#[cfg(test)]
impl Global for EventPopoverHandle {}

impl EventPopover {
    #[cfg(test)]
    pub fn global(cx: &App) -> Option<Entity<Self>> {
        cx.try_global::<EventPopoverHandle>()?.0.upgrade()
    }

    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        #[cfg(test)]
        {
            let handle = EventPopoverHandle(cx.entity().downgrade());
            cx.set_global(handle);
        }
        let store = EventStore::global(cx);
        let draft = DraftState::global(cx);
        Self {
            target: None,
            form: None,
            anchor: None,
            focus: cx.focus_handle(),
            narrow: false,
            _subscriptions: vec![
                cx.observe_in(&store, window, |this, _, window, cx| this.sync(window, cx)),
                cx.observe_in(&draft, window, |this, _, window, cx| this.sync(window, cx)),
            ],
        }
    }

    pub fn is_open(&self) -> bool {
        self.form.is_some()
    }

    pub fn form(&self) -> Option<&Entity<EventForm>> {
        self.form.as_ref()
    }

    pub fn set_narrow(&mut self, narrow: bool) {
        self.narrow = narrow;
    }

    /// Whether the new-event draft is what's open (not an event).
    pub fn is_draft(&self) -> bool {
        self.target == Some(Target::Draft) && self.form.is_some()
    }

    fn wanted(&self, cx: &App) -> Option<Target> {
        let store = EventStore::global(cx).read(cx);
        match store.active_event() {
            Some(key) => Some(Target::Event(key.clone())),
            None if DraftState::read(cx).is_popover_open() => Some(Target::Draft),
            None => None,
        }
    }

    /// Follows the open event / draft.
    fn sync(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let wanted = self.wanted(cx);
        if wanted == self.target {
            // The open event went away (deleted, moved): close it.
            if let Some(Target::Event(key)) = &self.target
                && self.form.is_some()
                && EventStore::global(cx).read(cx).event(key).is_none()
            {
                self.form = None;
                cx.notify();
            }
            return;
        }
        if let Some(form) = self.form.take() {
            // Focus inside the popover goes back to the calendar.
            if self.focus.contains_focused(window, cx) {
                crate::windows::main_window::focus_calendar(window, cx);
            }
            form.update(cx, |form, cx| form.finish(window, cx));
        }
        self.target = wanted.clone();
        match wanted {
            Some(Target::Event(key)) => {
                let event = EventStore::global(cx).read(cx).event(&key).cloned();
                if let Some(event) = event {
                    let pending = cx
                        .has_global::<PendingAnchor>()
                        .then(|| cx.remove_global::<PendingAnchor>())
                        .filter(|PendingAnchor(pending, _)| *pending == key)
                        .map(|PendingAnchor(_, bounds)| bounds);
                    self.anchor = pending.or_else(|| Anchors::event_bounds(&key, None, cx));
                    self.open_form(cx.new(|cx| EventForm::edit(event, window, cx)), window, cx);
                }
            }
            Some(Target::Draft) => {
                self.anchor = DraftState::read(cx)
                    .anchor()
                    .or_else(|| Anchors::named(Named::ActiveDay, cx));
                let form = cx.new(|cx| EventForm::compose(window, cx));
                // The title takes focus once the popover is up.
                let entry = form.clone();
                window.defer(cx, move |window, cx| {
                    entry.update(cx, |form, cx| form.focus_entry(window, cx))
                });
                self.open_form(form, window, cx);
            }
            None => {}
        }
        cx.notify();
    }

    fn open_form(&mut self, form: Entity<EventForm>, window: &mut Window, cx: &mut Context<Self>) {
        let subscription = cx.subscribe_in(
            &form,
            window,
            |this, form, event: &FormEvent, window, cx| {
                let FormEvent::Done = event;
                if form.read(cx).kind() == &FormKind::Compose {
                    DraftState::global(cx).update(cx, |state, cx| {
                        state.flush_parse(cx);
                        state.create(cx);
                        state.close_popover(cx);
                    });
                } else {
                    this.close(window, cx);
                }
            },
        );
        self._subscriptions.push(subscription);
        self.form = Some(form);
    }

    /// Closes whatever is open; an edited event saves.
    pub fn close(&mut self, _: &mut Window, cx: &mut Context<Self>) {
        match self.target {
            Some(Target::Event(_)) => {
                EventStore::global(cx).update(cx, |store, cx| store.set_active_event(None, cx));
            }
            Some(Target::Draft) => {
                DraftState::global(cx).update(cx, |state, cx| state.close_popover(cx));
            }
            None => {}
        }
    }

    /// Where the card goes: right of the anchor, centred on it, or left when
    /// it doesn't fit.
    fn placement(&self, window: &Window) -> (gpui_kit::Point<Pixels>, Anchor) {
        let viewport = window.viewport_size();
        let anchor = self.anchor.unwrap_or_else(|| {
            Bounds::new(
                point(viewport.width / 2.0 - WIDTH / 2.0, viewport.height / 3.0),
                size(px(0.), px(0.)),
            )
        });
        let middle = anchor.top() + anchor.size.height / 2.0;
        let fits_right = anchor.right() + SIDE_OFFSET + WIDTH + COLLISION_PADDING <= viewport.width;
        if fits_right || anchor.left() - SIDE_OFFSET - WIDTH < COLLISION_PADDING {
            (
                point(anchor.right() + SIDE_OFFSET, middle),
                Anchor::LeftCenter,
            )
        } else {
            (
                point(anchor.left() - SIDE_OFFSET, middle),
                Anchor::RightCenter,
            )
        }
    }
}

impl Render for EventPopover {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let Some(form) = self.form.clone() else {
            return div().into_any_element();
        };
        if self.narrow && self.target == Some(Target::Draft) {
            // Narrow windows have no new-event popover (the old app mounted it
            // only above `md`).
            return div().into_any_element();
        }
        let theme = ThemeStore::active(cx);
        let surface = color(&theme, "elevated_surface.background");
        let border = color(&theme, "border");
        let viewport = window.viewport_size();
        let close = cx.listener(|this, _: &ClosePopover, window, cx| this.close(window, cx));

        if self.narrow {
            let width = (viewport.width * 0.75).min(SHEET_MAX_WIDTH);
            return deferred(
                div()
                    .id("event-sheet-layer")
                    .absolute()
                    .top_0()
                    .left_0()
                    .size_full()
                    .occlude()
                    .child(
                        div()
                            .id("event-sheet-overlay")
                            .absolute()
                            .top_0()
                            .left_0()
                            .size_full()
                            .bg(color(&theme, "overlay"))
                            .on_click(cx.listener(|this, _, window, cx| this.close(window, cx))),
                    )
                    .child(
                        div()
                            .id("event-sheet")
                            .key_context(KEY_CONTEXT)
                            .track_focus(&self.focus)
                            .on_action(close)
                            .absolute()
                            .top_0()
                            .right_0()
                            .h_full()
                            .w(width)
                            .overflow_y_scroll()
                            .bg(surface)
                            .border_l_1()
                            .border_color(border)
                            .child(drag_region("event-sheet-drag").h(px(28.)).w_full())
                            .child(form)
                            .focus_trap("event-sheet-trap", &self.focus),
                    ),
            )
            .with_priority(1)
            .into_any_element();
        }

        let (position, anchor) = self.placement(window);
        let card = div()
            .id("event-popover")
            .key_context(KEY_CONTEXT)
            .track_focus(&self.focus)
            .on_action(close)
            .occlude()
            .relative()
            .w(WIDTH)
            .max_h(viewport.height * 0.8)
            .overflow_y_scroll()
            .bg(surface)
            .border_1()
            .border_color(border)
            .rounded(radius(&theme, 1.0))
            .shadow(vec![BoxShadow {
                color: gpui_kit::hsla(0., 0., 0., 0.25),
                offset: point(px(0.), px(25.)),
                blur_radius: px(50.),
                spread_radius: px(-12.),
                inset: false,
            }])
            .on_mouse_down_out(
                cx.listener(|this, event: &gpui_kit::MouseDownEvent, window, cx| {
                    // An event block's own click switches or closes the popover; a
                    // menu, list or dialog over the popover closes first.
                    if Anchors::event_at(event.position, cx).is_some()
                        || GlobalState::is_in_deferred_context(cx)
                        || window.has_active_dialog(cx)
                    {
                        return;
                    }
                    ClickGuard::swallow(cx);
                    this.close(window, cx);
                }),
            )
            .child(form)
            .focus_trap("event-popover-trap", &self.focus);

        deferred(
            anchored()
                .position(position)
                .anchor(anchor)
                .snap_to_window_with_margin(COLLISION_PADDING)
                .child(card),
        )
        .with_priority(1)
        .into_any_element()
    }
}
