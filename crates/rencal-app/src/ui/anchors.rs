//! Where things were painted last frame (GPUI_PORT_PLAN.md §6.2–§6.4): the
//! event blocks, the drop targets of drag sessions, the scroll containers
//! that auto-scroll while dragging, and a few named anchors (the active day,
//! the compose card, minical cells). This replaces the DOM lookups of the old
//! app (`elementsFromPoint`, `getBoundingClientRect`, `data-drop-day`).
//!
//! Elements record themselves with an invisible `canvas` child during
//! prepaint (`event_anchor`, `drop_anchor`, …), clipped to what is actually
//! visible. The main window starts each frame with `begin_frame`, so readers
//! between frames see exactly what is on screen. Bounds are window
//! coordinates.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use chrono::NaiveDate;
use gpui_kit::{App, Bounds, Global, IntoElement, Pixels, Point, Styled, Window, canvas};
use rencal_layout::drag::DropZone;
use rencal_time::EventKey;

/// Where an event block is drawn.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventSource {
    /// A calendar view (month, week, board).
    View,
    Agenda,
}

#[derive(Clone, Debug)]
pub struct EventRegion {
    pub bounds: Bounds<Pixels>,
    pub key: EventKey,
    pub source: EventSource,
}

#[derive(Clone, Copy, Debug)]
pub struct DropRegion {
    /// The visible part, for hit tests.
    pub bounds: Bounds<Pixels>,
    /// The whole target, scrolled-out parts included (a day column's 24
    /// hours), for pointer → minutes.
    pub full: Bounds<Pixels>,
    pub zone: DropZone,
    pub day: NaiveDate,
}

/// Anchors looked up by name.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Named {
    /// The active day's cell (month) or column (week): where "add event on
    /// the active day" anchors its popover.
    ActiveDay,
    /// The sidebar compose card (the fly animation's start).
    ComposeCard,
    /// The minical, and its day cells (the fly animation's target).
    Minical,
    MinicalDay(NaiveDate),
}

/// Scrolls a container by a pixel delta (edge auto-scroll while dragging).
pub type ScrollBy = Rc<dyn Fn(Point<f32>, &mut App)>;

#[derive(Clone)]
pub struct Scroller {
    pub bounds: Bounds<Pixels>,
    pub scroll_x: bool,
    pub scroll_y: bool,
    pub scroll_by: ScrollBy,
}

#[derive(Default)]
struct Frame {
    events: Vec<EventRegion>,
    drops: Vec<DropRegion>,
    named: HashMap<Named, Bounds<Pixels>>,
    scrollers: Vec<Scroller>,
}

#[derive(Default)]
pub struct Anchors(RefCell<Frame>);

impl Global for Anchors {}

fn with_frame<R>(cx: &App, f: impl FnOnce(&mut Frame) -> R) -> Option<R> {
    cx.try_global::<Anchors>()
        .map(|anchors| f(&mut anchors.0.borrow_mut()))
}

impl Anchors {
    pub fn init(cx: &mut App) {
        cx.set_global(Self::default());
    }

    /// Forgets the last frame; called by the main window before it renders.
    pub fn begin_frame(cx: &App) {
        with_frame(cx, |frame| {
            frame.events.clear();
            frame.drops.clear();
            frame.named.clear();
            frame.scrollers.clear();
        });
    }

    /// The topmost event block at `position`.
    pub fn event_at(position: Point<Pixels>, cx: &App) -> Option<EventRegion> {
        with_frame(cx, |frame| {
            frame
                .events
                .iter()
                .rev()
                .find(|region| region.bounds.contains(&position))
                .cloned()
        })
        .flatten()
    }

    /// Where `key` is drawn: the block under `position` if given, else the
    /// first view block, else an agenda row.
    pub fn event_bounds(
        key: &EventKey,
        position: Option<Point<Pixels>>,
        cx: &App,
    ) -> Option<Bounds<Pixels>> {
        with_frame(cx, |frame| {
            let mut regions = frame.events.iter().filter(|region| &region.key == key);
            if let Some(position) = position {
                return regions
                    .find(|region| region.bounds.contains(&position))
                    .map(|region| region.bounds);
            }
            let regions: Vec<_> = regions.collect();
            regions
                .iter()
                .find(|region| region.source == EventSource::View)
                .or_else(|| regions.first())
                .map(|region| region.bounds)
        })
        .flatten()
    }

    /// Where `key` is drawn in `source`.
    pub fn event_bounds_in(
        key: &EventKey,
        source: EventSource,
        cx: &App,
    ) -> Option<Bounds<Pixels>> {
        with_frame(cx, |frame| {
            frame
                .events
                .iter()
                .find(|region| &region.key == key && region.source == source)
                .map(|region| region.bounds)
        })
        .flatten()
    }

    /// The drop target at `position`.
    pub fn drop_at(position: Point<Pixels>, cx: &App) -> Option<DropRegion> {
        with_frame(cx, |frame| {
            frame
                .drops
                .iter()
                .rev()
                .find(|region| region.bounds.contains(&position))
                .copied()
        })
        .flatten()
    }

    /// The drop target of `zone` on `day` (a create session's origin column).
    pub fn drop_for(zone: DropZone, day: NaiveDate, cx: &App) -> Option<DropRegion> {
        with_frame(cx, |frame| {
            frame
                .drops
                .iter()
                .find(|region| region.zone == zone && region.day == day)
                .copied()
        })
        .flatten()
    }

    pub fn named(name: Named, cx: &App) -> Option<Bounds<Pixels>> {
        with_frame(cx, |frame| frame.named.get(&name).copied()).flatten()
    }

    /// The scroll container at `position`.
    pub fn scroller_at(position: Point<Pixels>, cx: &App) -> Option<Scroller> {
        with_frame(cx, |frame| {
            frame
                .scrollers
                .iter()
                .rev()
                .find(|scroller| scroller.bounds.contains(&position))
                .cloned()
        })
        .flatten()
    }
}

/// The part of `bounds` inside the current clip, or `None` when hidden.
fn visible(bounds: Bounds<Pixels>, window: &Window) -> Option<Bounds<Pixels>> {
    let clipped = bounds.intersect(&window.content_mask().bounds);
    (clipped.size.width > Pixels::ZERO && clipped.size.height > Pixels::ZERO).then_some(clipped)
}

/// An invisible element filling its parent that calls `record` with the
/// parent's visible and full bounds during prepaint.
fn recorder(
    record: impl FnOnce(Bounds<Pixels>, Bounds<Pixels>, &App) + 'static,
) -> impl IntoElement {
    canvas(
        move |bounds, window, cx| {
            if let Some(clipped) = visible(bounds, window) {
                record(clipped, bounds, cx);
            }
        },
        |_, _, _, _| {},
    )
    .absolute()
    .top_0()
    .left_0()
    .size_full()
}

/// Records an event block (for hit tests and popover anchors).
pub fn event_anchor(key: EventKey, source: EventSource) -> impl IntoElement {
    recorder(move |bounds, _, cx| {
        with_frame(cx, |frame| {
            frame.events.push(EventRegion {
                bounds,
                key,
                source,
            })
        });
    })
}

/// Records a drop target of a drag session.
pub fn drop_anchor(zone: DropZone, day: NaiveDate) -> impl IntoElement {
    recorder(move |bounds, full, cx| {
        with_frame(cx, |frame| {
            frame.drops.push(DropRegion {
                bounds,
                full,
                zone,
                day,
            })
        });
    })
}

pub fn named_anchor(name: Named) -> impl IntoElement {
    recorder(move |bounds, _, cx| {
        with_frame(cx, |frame| frame.named.insert(name, bounds));
    })
}

/// Records a scroll container that drags auto-scroll near its edges.
pub fn scroll_anchor(scroll_x: bool, scroll_y: bool, scroll_by: ScrollBy) -> impl IntoElement {
    recorder(move |bounds, _, cx| {
        with_frame(cx, |frame| {
            frame.scrollers.push(Scroller {
                bounds,
                scroll_x,
                scroll_y,
                scroll_by,
            })
        });
    })
}
