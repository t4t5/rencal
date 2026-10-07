//! Drag-to-reschedule (port of `lib/event-drag.ts`, see `docs/drag-to-reschedule.md`).
//!
//! A drag moves an event by a whole-day delta (month cells, all-day lanes) and,
//! in the week time grid, an additional wallclock-minute delta. Deltas are
//! applied to both start and end so the duration and the event's own zone are
//! preserved: dragging never re-zones or re-kinds an event.

use chrono::NaiveDate;
use rencal_time::constants::DAY_MINUTES;
use rencal_time::{CalendarEvent, EventTimeRange, Tz, epoch_day};

use crate::{Point, Rect, js_round};

/// Timed drops snap to this many minutes.
pub const DRAG_SNAP_MINUTES: i32 = 15;

/// Pointer travel before a press turns into a drag, so plain clicks still open
/// the event.
pub const DRAG_THRESHOLD_PX: f32 = 4.0;

/// Distance from a scroll container's edge within which dragging auto-scrolls it.
pub const AUTOSCROLL_EDGE_PX: f32 = 48.0;
/// Auto-scroll step per frame at (or just beyond) the edge.
pub const AUTOSCROLL_MAX_STEP_PX: f32 = 16.0;

/// Appended to the dragged event's id for its drop-position stand-in, so the
/// two never collide in keyed state (bounds maps, the active-event tracker).
pub const DRAG_PREVIEW_ID_SUFFIX: &str = "__drag-preview";

/// Grid regions an event can be dropped on.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum DropZone {
    /// A month-view cell. Any event; keeps its wallclock time.
    Day,
    /// The week view's all-day lane. Spanning events only.
    AllDay,
    /// A week-view day column. Single-day timed events only.
    Timed,
}

/// What is under the pointer, resolved by the app's hit-testing.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DropHit {
    pub zone: DropZone,
    pub day: NaiveDate,
    /// Viewer-zone wallclock minutes of day under the pointer (unsnapped);
    /// `DropZone::Timed` only.
    pub minutes: Option<f64>,
}

/// Where the event was grabbed relative to its own start, so the block follows
/// the pointer instead of snapping its start to it: a multi-day bar grabbed on
/// its third day keeps that day under the pointer, and a timed block grabbed
/// near its bottom keeps that offset.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct DragGrab {
    pub day_offset: i32,
    pub minute_offset: f64,
}

/// The grab offsets for pressing `event` at `hit` (no offset without a hit).
pub fn grab_for(event: &CalendarEvent, hit: Option<&DropHit>) -> DragGrab {
    let Some(hit) = hit else {
        return DragGrab::default();
    };
    let info = &event.date_info;
    DragGrab {
        day_offset: epoch_day(hit.day) - info.first_day,
        minute_offset: hit
            .minutes
            .map_or(0.0, |minutes| minutes - f64::from(info.start_local_minutes)),
    }
}

/// Duration of a single-day timed event; one ending at midnight counts to
/// midnight.
fn timed_duration_minutes(event: &CalendarEvent) -> i32 {
    let info = &event.date_info;
    if info.end_day > info.first_day {
        DAY_MINUTES - info.start_local_minutes
    } else {
        info.end_local_minutes - info.start_local_minutes
    }
}

fn shift_range(event: &CalendarEvent, days: i64, minutes: i64) -> EventTimeRange {
    EventTimeRange {
        start: event.start.add_minutes(minutes).add_days(days),
        end: event.end.add_minutes(minutes).add_days(days),
    }
}

/// The range `event` would occupy if dropped at `hit`, or `None` when it can't
/// be dropped there or would stay where it is.
pub fn compute_drop_range(
    event: &CalendarEvent,
    hit: &DropHit,
    grab: &DragGrab,
) -> Option<EventTimeRange> {
    let spanning = event.is_spanning();
    let day_delta = i64::from(epoch_day(hit.day) - grab.day_offset - event.date_info.first_day);

    match hit.zone {
        DropZone::Timed => {
            if spanning {
                return None;
            }
            let minutes = hit.minutes?;
            let snap = f64::from(DRAG_SNAP_MINUTES);
            let snapped = js_round((minutes - grab.minute_offset) / snap) * snap;
            // Keep the whole event inside the day it was dropped on.
            let max_start = (DAY_MINUTES - timed_duration_minutes(event)).max(0);
            let new_start = snapped.clamp(0.0, f64::from(max_start)) as i64;
            let minute_delta = new_start - i64::from(event.date_info.start_local_minutes);
            if day_delta == 0 && minute_delta == 0 {
                return None;
            }
            Some(shift_range(event, day_delta, minute_delta))
        }
        DropZone::AllDay if !spanning => None,
        DropZone::Day | DropZone::AllDay => {
            (day_delta != 0).then(|| shift_range(event, day_delta, 0))
        }
    }
}

/// A stand-in rendered at the drop position while dragging, with its own id
/// (`DRAG_PREVIEW_ID_SUFFIX`) so it never collides with the dimmed source event.
pub fn make_drag_preview(
    event: &CalendarEvent,
    range: &EventTimeRange,
    viewer: Tz,
) -> CalendarEvent {
    let mut preview = event.with_dates(range.start.clone(), range.end.clone(), viewer);
    preview.id.push_str(DRAG_PREVIEW_ID_SUFFIX);
    preview
}

/// How far a scroll container should scroll this frame for a pointer at
/// `pointer`: nothing while the pointer is away from its edges, ramping up to
/// `AUTOSCROLL_MAX_STEP_PX` as it reaches (or passes just beyond) an edge.
/// Axes the container can't scroll stay 0.
pub fn edge_scroll_delta(rect: &Rect, pointer: Point, scroll_x: bool, scroll_y: bool) -> Point {
    let edge = AUTOSCROLL_EDGE_PX;
    let Point { x, y } = pointer;
    let outside = x < rect.left - edge
        || x > rect.right + edge
        || y < rect.top - edge
        || y > rect.bottom + edge;
    if outside {
        return Point::default();
    }

    let ramp = |depth: f32| ((depth / edge).min(1.0) * AUTOSCROLL_MAX_STEP_PX).ceil();
    let along = |pos: f32, min: f32, max: f32| {
        if pos < min + edge {
            -ramp(min + edge - pos)
        } else if pos > max - edge {
            ramp(pos - (max - edge))
        } else {
            0.0
        }
    };

    Point {
        x: if scroll_x {
            along(x, rect.left, rect.right)
        } else {
            0.0
        },
        y: if scroll_y {
            along(y, rect.top, rect.bottom)
        } else {
            0.0
        },
    }
}
