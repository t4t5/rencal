//! Drag to reschedule and drag to create (GPUI_PORT_PLAN.md §6.2; ports of
//! `EventDragContext.tsx`, `useDragToCreateSession.ts`, `useDragToCreate.ts`,
//! `useDragToCreateDays.ts` and `EventDragOverlay.tsx`). Specs:
//! `docs/drag-to-reschedule.md`, `docs/drag-to-create.md`.
//!
//! One pointer session at a time, not GPUI's typed drag and drop:
//! - A left press on an event block (`press_event`) or on empty day
//!   background (`press_create_timed`, `press_create_days`) starts a pending
//!   session; it activates after `DRAG_THRESHOLD_PX` of travel, so clicks
//!   still click. The release after an activated drag is swallowed
//!   (`ClickGuard`).
//! - While active, the main window routes window-wide mouse moves, the
//!   release and Escape here (`listeners`), and edge auto-scroll runs every
//!   frame. Targets come from last frame's drop regions (`ui::anchors`); the
//!   maths is `rencal_layout::drag`.
//! - Rescheduling dims the source block, injects a preview at the snapped
//!   drop (`DragOverlay::preview`) and draws a floating copy under the
//!   pointer (`float_layer`). Dropping saves through
//!   `commands::request_save`, so recurring events ask for a scope.
//! - Creating draws the selection; releasing opens the new-event popover for
//!   it.

use std::cell::RefCell;

use chrono::NaiveDate;
use gpui_kit::component::h_flex;
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    AnyElement, App, BorrowAppContext, DispatchPhase, FontWeight, Global, InteractiveElement,
    IntoElement, KeyDownEvent, MouseMoveEvent, MouseUpEvent, ParentElement, Pixels, Point, Size,
    Styled, Window, deferred, div, point, px,
};
use rencal_layout::drag::{
    CreateSelection, DRAG_THRESHOLD_PX, DaySelection, DragGrab, DropHit, DropZone,
    clamp_point_to_rect, compute_drop_range, day_selection_for_pointer, day_selection_range,
    edge_scroll_delta, grab_for, make_drag_preview, minutes_at_y, selection_for_pointer,
    selection_range,
};
use rencal_layout::{Point as LayoutPoint, Rect};
use rencal_time::constants::DAY_MINUTES;
use rencal_time::display::format_time;
use rencal_time::{CalendarEvent, EventKey, EventTimeRange};

use super::draft::{DayDraft, DraftState};
use super::{ClickGuard, commands};
use crate::clock::Clock;
use crate::event_store::EventStore;
use crate::settings::Settings;
use crate::theme::ThemeStore;
use crate::ui::anchors::{Anchors, Scroller};
use crate::ui::event_paint::event_paint;
use crate::ui::{event_title, radius, text_size};

/// How the floating copy under the pointer is drawn.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FloatKind {
    /// A title pill (month view, all-day lanes).
    Pill,
    /// The block at its size, showing the new time (week time grid).
    Block,
}

#[derive(Clone, Copy, Debug)]
struct Float {
    kind: FloatKind,
    size: Size<Pixels>,
    /// The pointer's offset from the block's top-left at the press.
    offset: Point<Pixels>,
}

#[derive(Clone, Debug)]
enum Kind {
    Reschedule {
        event: Box<CalendarEvent>,
        float: Float,
        grab: DragGrab,
        target: Option<EventTimeRange>,
        preview: Option<Box<CalendarEvent>>,
    },
    CreateTimed {
        day: NaiveDate,
        anchor_minutes: f64,
        selection: Option<CreateSelection>,
    },
    CreateDays {
        anchor: NaiveDate,
        selection: Option<DaySelection>,
        /// The day under the pointer last (the popover's anchor).
        last_day: Option<NaiveDate>,
    },
}

#[derive(Clone)]
struct Session {
    kind: Kind,
    start: Point<Pixels>,
    last: Point<Pixels>,
    scroller: Option<Scroller>,
    activated: bool,
    cancelled: bool,
}

/// The drag session. Views observe it for the preview, the dimmed source
/// and the create selection (`overlay`).
#[derive(Default)]
pub struct DragState {
    session: RefCell<Option<Session>>,
    /// Bumps whenever what the views draw changes.
    revision: std::cell::Cell<u64>,
}

impl Global for DragState {}

/// What the views draw for the active session.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct DragOverlay {
    /// The dragged event at the drop position (its id carries
    /// `DRAG_PREVIEW_ID_SUFFIX`).
    pub preview: Option<CalendarEvent>,
    /// The dragged event's own block, drawn dimmed.
    pub source: Option<EventKey>,
    /// A week column's create selection.
    pub timed_selection: Option<(NaiveDate, CreateSelection)>,
    /// The month grid's create selection.
    pub day_selection: Option<DaySelection>,
}

impl DragState {
    pub fn init(cx: &mut App) {
        cx.set_global(Self::default());
    }

    pub fn revision(cx: &App) -> u64 {
        cx.try_global::<Self>()
            .map_or(0, |state| state.revision.get())
    }

    pub fn is_active(cx: &App) -> bool {
        cx.try_global::<Self>()
            .is_some_and(|state| state.session.borrow().is_some())
    }

    /// The active session's drawing.
    pub fn overlay(cx: &App) -> DragOverlay {
        let Some(state) = cx.try_global::<Self>() else {
            return DragOverlay::default();
        };
        let session = state.session.borrow();
        let Some(session) = session.as_ref().filter(|s| s.activated && !s.cancelled) else {
            return DragOverlay::default();
        };
        match &session.kind {
            Kind::Reschedule { event, preview, .. } => DragOverlay {
                preview: preview.as_deref().cloned(),
                source: Some(event.key()),
                ..Default::default()
            },
            Kind::CreateTimed { day, selection, .. } => DragOverlay {
                timed_selection: selection.map(|s| (*day, s)),
                ..Default::default()
            },
            Kind::CreateDays { selection, .. } => DragOverlay {
                day_selection: *selection,
                ..Default::default()
            },
        }
    }
}

fn begin(kind: Kind, position: Point<Pixels>, window: &mut Window, cx: &mut App) {
    if DragState::is_active(cx) {
        return;
    }
    let session = Session {
        kind,
        start: position,
        last: position,
        scroller: Anchors::scroller_at(position, cx),
        activated: false,
        cancelled: false,
    };
    *cx.global::<DragState>().session.borrow_mut() = Some(session);
    window.refresh();
}

/// Tells the views the drawing changed.
fn changed(cx: &mut App) {
    cx.update_global::<DragState, _>(|state, _| state.revision.set(state.revision.get() + 1));
}

/// A left press on an event block. Read-only events don't drag.
pub fn press_event(
    event: &CalendarEvent,
    kind: FloatKind,
    position: Point<Pixels>,
    window: &mut Window,
    cx: &mut App,
) {
    if event.is_readonly(EventStore::global(cx).read(cx).calendars()) {
        return;
    }
    let Some(bounds) = Anchors::event_bounds(&event.key(), Some(position), cx) else {
        return;
    };
    let float = Float {
        kind,
        size: bounds.size,
        offset: position - bounds.origin,
    };
    begin(
        Kind::Reschedule {
            event: Box::new(event.clone()),
            float,
            grab: DragGrab::default(),
            target: None,
            preview: None,
        },
        position,
        window,
        cx,
    );
}

/// A left press on a week column's background.
pub fn press_create_timed(
    day: NaiveDate,
    position: Point<Pixels>,
    window: &mut Window,
    cx: &mut App,
) {
    // An event block over the background keeps the press.
    if Anchors::event_at(position, cx).is_some() {
        return;
    }
    let Some(column) = Anchors::drop_for(DropZone::Timed, day, cx) else {
        return;
    };
    let anchor_minutes = minutes_at_y(
        f32::from(column.full.top()),
        f32::from(column.full.size.height),
        f32::from(position.y),
    );
    begin(
        Kind::CreateTimed {
            day,
            anchor_minutes,
            selection: None,
        },
        position,
        window,
        cx,
    );
}

/// A left press on a month cell's background or day header.
pub fn press_create_days(
    day: NaiveDate,
    position: Point<Pixels>,
    window: &mut Window,
    cx: &mut App,
) {
    if Anchors::event_at(position, cx).is_some() {
        return;
    }
    begin(
        Kind::CreateDays {
            anchor: day,
            selection: None,
            last_day: None,
        },
        position,
        window,
        cx,
    );
}

fn rect(bounds: gpui_kit::Bounds<Pixels>) -> Rect {
    Rect {
        left: f32::from(bounds.left()),
        top: f32::from(bounds.top()),
        right: f32::from(bounds.right()),
        bottom: f32::from(bounds.bottom()),
    }
}

fn drop_hit(position: Point<Pixels>, cx: &App) -> Option<DropHit> {
    let region = Anchors::drop_at(position, cx)?;
    let minutes = (region.zone == DropZone::Timed).then(|| {
        minutes_at_y(
            f32::from(region.full.top()),
            f32::from(region.full.size.height),
            f32::from(position.y),
        )
    });
    Some(DropHit {
        zone: region.zone,
        day: region.day,
        minutes,
    })
}

/// Recomputes the target / selection for the pointer. True when it changed.
fn update_target(session: &mut Session, pointer: Point<Pixels>, cx: &App) -> bool {
    let viewer = Clock::global(cx).viewer;
    match &mut session.kind {
        Kind::Reschedule {
            event,
            grab,
            target,
            preview,
            ..
        } => {
            let range = drop_hit(pointer, cx).and_then(|hit| compute_drop_range(event, &hit, grab));
            if range == *target {
                return false;
            }
            *preview = range
                .as_ref()
                .map(|range| Box::new(make_drag_preview(event, range, viewer)));
            *target = range;
            true
        }
        Kind::CreateTimed {
            day,
            anchor_minutes,
            selection,
        } => {
            let Some(column) = Anchors::drop_for(DropZone::Timed, *day, cx) else {
                return false;
            };
            let minutes = minutes_at_y(
                f32::from(column.full.top()),
                f32::from(column.full.size.height),
                f32::from(pointer.y),
            );
            let next = selection_for_pointer(*anchor_minutes, minutes);
            if *selection == Some(next) {
                return false;
            }
            *selection = Some(next);
            true
        }
        Kind::CreateDays {
            anchor,
            selection,
            last_day,
        } => {
            // Clamp into the grid, so dragging past it hits its edge cells;
            // over a border or gap the last selection stays.
            let point = match &session.scroller {
                Some(scroller) => {
                    let p = clamp_point_to_rect(
                        &rect(scroller.bounds),
                        LayoutPoint {
                            x: f32::from(pointer.x),
                            y: f32::from(pointer.y),
                        },
                    );
                    gpui_kit::point(px(p.x), px(p.y))
                }
                None => pointer,
            };
            let Some(region) = Anchors::drop_at(point, cx).filter(|r| r.zone == DropZone::Day)
            else {
                return false;
            };
            *last_day = Some(region.day);
            let next = day_selection_for_pointer(*anchor, region.day);
            if *selection == Some(next) {
                return false;
            }
            *selection = Some(next);
            true
        }
    }
}

fn activate(session: &mut Session, cx: &mut App) {
    session.activated = true;
    if let Kind::Reschedule { event, grab, .. } = &mut session.kind {
        *grab = grab_for(event, drop_hit(session.start, cx).as_ref());
        log::debug!("drag: activate {}", event.key().0);
    }
    // Seed the selection at the press, so a drag that activates over a gap
    // still has its minimum selection.
    let start = session.start;
    update_target(session, start, cx);
}

fn session(cx: &App) -> Option<Session> {
    cx.try_global::<DragState>()?.session.borrow().clone()
}

fn store_session(session: Session, cx: &App) {
    *cx.global::<DragState>().session.borrow_mut() = Some(session);
}

fn on_move(position: Point<Pixels>, window: &mut Window, cx: &mut App) {
    let Some(mut session) = session(cx).filter(|s| !s.cancelled) else {
        return;
    };
    session.last = position;
    let mut activated_now = false;
    if !session.activated {
        let travel = position - session.start;
        if f32::from(travel.x).hypot(f32::from(travel.y)) < DRAG_THRESHOLD_PX {
            store_session(session, cx);
            return;
        }
        activate(&mut session, cx);
        activated_now = true;
    }
    let target_changed = update_target(&mut session, position, cx);
    let reschedule = matches!(session.kind, Kind::Reschedule { .. });
    store_session(session, cx);
    if activated_now {
        // The popover would otherwise stay open on the event being moved.
        if reschedule {
            EventStore::global(cx).update(cx, |store, cx| store.set_active_event(None, cx));
        }
        schedule_autoscroll(window, cx);
    }
    if activated_now || target_changed {
        changed(cx);
    }
    window.refresh();
}

/// Edge auto-scroll, every frame while the drag is active.
fn schedule_autoscroll(window: &mut Window, _cx: &mut App) {
    window.on_next_frame(move |window, cx| {
        let Some(mut session) = session(cx).filter(|s| s.activated && !s.cancelled) else {
            return;
        };
        if let Some(scroller) = session.scroller.clone() {
            let delta = edge_scroll_delta(
                &rect(scroller.bounds),
                LayoutPoint {
                    x: f32::from(session.last.x),
                    y: f32::from(session.last.y),
                },
                scroller.scroll_x,
                scroller.scroll_y,
            );
            if delta.x != 0.0 || delta.y != 0.0 {
                (scroller.scroll_by)(point(delta.x, delta.y), cx);
                let last = session.last;
                if update_target(&mut session, last, cx) {
                    store_session(session, cx);
                    changed(cx);
                }
                window.refresh();
            }
        }
        schedule_autoscroll(window, cx);
    });
}

fn on_up(window: &mut Window, cx: &mut App) {
    let Some(session) = cx.global::<DragState>().session.borrow_mut().take() else {
        return;
    };
    if session.activated {
        ClickGuard::swallow(cx);
        if !session.cancelled {
            commit(session, window, cx);
        }
    }
    changed(cx);
    window.refresh();
}

fn cancel(window: &mut Window, cx: &mut App) {
    let Some(mut session) = session(cx).filter(|s| !s.cancelled) else {
        return;
    };
    session.cancelled = true;
    store_session(session, cx);
    {
        log::debug!("drag: cancel");
        changed(cx);
        window.refresh();
    }
}

fn commit(session: Session, window: &mut Window, cx: &mut App) {
    let viewer = Clock::global(cx).viewer;
    match session.kind {
        Kind::Reschedule {
            event,
            target: Some(target),
            ..
        } => {
            // Closing the popover at activation may have saved other edits
            // to this event since: move the latest copy.
            let original = EventStore::global(cx)
                .read(cx)
                .event(&event.key())
                .cloned()
                .unwrap_or(*event);
            let current = original.with_dates(target.start, target.end, viewer);
            commands::request_save(current, original, window, cx);
        }
        Kind::Reschedule { target: None, .. } => {}
        Kind::CreateTimed {
            day,
            selection: Some(selection),
            ..
        } => {
            let range = selection_range(day, &selection, viewer);
            let column = Anchors::drop_for(DropZone::Timed, day, cx);
            let anchor_y = column.map(|column| {
                let middle = f64::from(selection.start_minutes + selection.end_minutes) / 2.0;
                column.full.top()
                    + column.full.size.height * (middle / f64::from(DAY_MINUTES)) as f32
            });
            DraftState::open_day_draft(
                day,
                column.map(|column| column.bounds),
                DayDraft {
                    all_day: false,
                    start: Some(range.start),
                    end: Some(range.end),
                    anchor_y,
                },
                cx,
            );
        }
        Kind::CreateDays {
            selection: Some(selection),
            last_day,
            ..
        } => {
            let range = day_selection_range(&selection);
            let anchor = last_day
                .and_then(|day| Anchors::drop_for(DropZone::Day, day, cx))
                .map(|cell| cell.bounds);
            DraftState::open_day_draft(
                selection.start,
                anchor,
                DayDraft {
                    all_day: true,
                    start: Some(range.start),
                    end: Some(range.end),
                    anchor_y: None,
                },
                cx,
            );
        }
        Kind::CreateTimed {
            selection: None, ..
        }
        | Kind::CreateDays {
            selection: None, ..
        } => {}
    }
}

/// Window-wide listeners while a session runs; the main window registers
/// them every frame from its paint phase.
pub fn listeners(window: &mut Window, cx: &mut App) {
    if !DragState::is_active(cx) {
        return;
    }
    window.on_mouse_event(|event: &MouseMoveEvent, phase, window, cx| {
        if phase == DispatchPhase::Bubble {
            on_move(event.position, window, cx);
        }
    });
    // Capture, so the release is swallowed before any click handler runs.
    window.on_mouse_event(|_: &MouseUpEvent, phase, window, cx| {
        if phase == DispatchPhase::Capture {
            on_up(window, cx);
        }
    });
    window.on_key_event(|event: &KeyDownEvent, phase, window, cx| {
        if phase == DispatchPhase::Capture && event.keystroke.key == "escape" {
            cancel(window, cx);
            cx.stop_propagation();
        }
    });
}

/// The floating copy under the pointer and the grabbing cursor.
pub fn float_layer(window: &mut Window, cx: &mut App) -> Option<AnyElement> {
    let session = session(cx).filter(|s| s.activated && !s.cancelled)?;
    let Kind::Reschedule {
        event,
        float,
        target,
        ..
    } = &session.kind
    else {
        return None;
    };
    let theme = ThemeStore::active(cx);
    let store = EventStore::global(cx).read(cx);
    let paint = event_paint(event, store.calendars(), &theme);
    let viewer = Clock::global(cx).viewer;
    let format = Settings::global(cx).time_format();
    let range = target
        .clone()
        .unwrap_or_else(|| EventTimeRange::new(event.start.clone(), event.end.clone()));
    let all_day = range.start.is_all_day();
    let muted = crate::ui::color(&theme, "text.muted");
    let pointer = session.last;
    let card = div()
        .absolute()
        .overflow_hidden()
        .rounded(radius(&theme, 0.4))
        .text_size(text_size(&theme, "xs"))
        .bg(paint.selected_fill)
        .text_color(paint.text)
        .shadow_xl()
        .map(|this| match float.kind {
            FloatKind::Block => this
                .left(pointer.x - float.offset.x)
                .top(pointer.y - float.offset.y)
                .w(float.size.width)
                .h(float.size.height)
                .px_1p5()
                .py_1(),
            FloatKind::Pill => this
                .left(pointer.x - px(12.))
                .top(pointer.y - px(10.))
                .px_1p5()
                .py_0p5()
                .whitespace_nowrap(),
        })
        .child(
            div()
                .font_weight(FontWeight::MEDIUM)
                .truncate()
                .child(event_title(&event.summary, muted)),
        )
        .when(float.kind == FloatKind::Block && !all_day, |this| {
            this.child(div().truncate().text_color(muted).child(format!(
                "{} – {}",
                format_time(&range.start, format, viewer),
                format_time(&range.end, format, viewer)
            )))
        });
    let _ = window;
    Some(
        deferred(
            h_flex()
                .id("drag-overlay")
                .absolute()
                .top_0()
                .left_0()
                .size_full()
                .cursor_grabbing()
                .child(card),
        )
        .with_priority(2)
        .into_any_element(),
    )
}
