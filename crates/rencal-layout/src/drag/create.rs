//! Drag-to-create (port of `lib/drag-to-create.ts`, see `docs/drag-to-create.md`):
//! a day selection in the month grid / all-day lane, or a snapped minute
//! selection in a week-view day column.

use chrono::{Days, NaiveDate};
use rencal_time::constants::DAY_MINUTES;
use rencal_time::{EventTime, EventTimeRange, Tz, at_time};

use super::DRAG_SNAP_MINUTES;
use crate::{Point, Rect};

/// A minute range within one day, snapped to `DRAG_SNAP_MINUTES`; the end may
/// be 1440 (24:00).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct CreateSelection {
    pub start_minutes: i32,
    pub end_minutes: i32,
}

/// An inclusive range of days.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct DaySelection {
    pub start: NaiveDate,
    pub end: NaiveDate,
}

/// The day range that always contains the anchor and grows toward the pointer.
pub fn day_selection_for_pointer(anchor: NaiveDate, pointer: NaiveDate) -> DaySelection {
    DaySelection {
        start: anchor.min(pointer),
        end: anchor.max(pointer),
    }
}

/// The all-day `[start, end)` range for a selection.
pub fn day_selection_range(selection: &DaySelection) -> EventTimeRange {
    EventTimeRange {
        start: EventTime::Date(selection.start),
        end: EventTime::Date(selection.end + Days::new(1)),
    }
}

/// Clamp a point just inside `rect`, so a drag outside it hits its edge cells.
pub fn clamp_point_to_rect(rect: &Rect, point: Point) -> Point {
    Point {
        x: point.x.min(rect.right - 1.0).max(rect.left + 1.0),
        y: point.y.min(rect.bottom - 1.0).max(rect.top + 1.0),
    }
}

/// Unclamped wallclock minutes of day at `y` inside a day column spanning
/// `column_top..column_top + column_height`.
pub fn minutes_at_y(column_top: f32, column_height: f32, y: f32) -> f64 {
    (f64::from(y) - f64::from(column_top)) / f64::from(column_height) * f64::from(DAY_MINUTES)
}

/// The snapped selection that always contains the anchor's slot and grows
/// toward the pointer.
pub fn selection_for_pointer(anchor_minutes: f64, pointer_minutes: f64) -> CreateSelection {
    let snap = f64::from(DRAG_SNAP_MINUTES);
    let day = f64::from(DAY_MINUTES);
    // Keep even an anchor on the exact bottom edge inside the day's final slot.
    let anchor = anchor_minutes.min(day - 1e-9).max(0.0);
    let slot_start = (anchor / snap).floor() * snap;
    let slot_end = slot_start + snap;
    let pointer = pointer_minutes.min(day).max(0.0);

    let (start, end) = if pointer >= slot_end {
        (slot_start, (pointer / snap).ceil() * snap)
    } else if pointer < slot_start {
        ((pointer / snap).floor() * snap, slot_end)
    } else {
        (slot_start, slot_end)
    };
    CreateSelection {
        start_minutes: start as i32,
        end_minutes: end as i32,
    }
}

/// The viewer-zone wallclock range for `selection` on `day`; 24:00 becomes the
/// next day's midnight. Wallclocks in a DST gap resolve later.
pub fn selection_range(day: NaiveDate, selection: &CreateSelection, viewer: Tz) -> EventTimeRange {
    let at = |minutes: i32| {
        if minutes == DAY_MINUTES {
            at_time(day + Days::new(1), 0, 0, viewer)
        } else {
            at_time(day, (minutes / 60) as u32, (minutes % 60) as u32, viewer)
        }
    };
    EventTimeRange {
        start: at(selection.start_minutes),
        end: at(selection.end_minutes),
    }
}
