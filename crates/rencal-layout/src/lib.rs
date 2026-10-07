//! Pure layout geometry for renCal (GPUI_PORT_PLAN.md §3.1): where events sit
//! in the week/day time grid and in month rows, how all-day bars stack into
//! lanes, and the pointer maths behind drag-to-reschedule, drag-to-create and
//! month-view week snapping.
//!
//! Port of `src/hooks/cal-events/{useDayRangeLayout,all-day-lanes,
//! useMonthEventLayout,useMonthGrid}.ts`, `month-view/{lane-geometry,
//! weekSnapFling}.ts`, `lib/event-drag.ts` and `lib/drag-to-create.ts`. The
//! React hooks became plain functions; layouts refer to events by their index
//! in the slice passed in, so the app can cache them and resolve calendar
//! colours itself.
//!
//! Units: pixel geometry is `f32` (the app converts to GPUI `Pixels`), minutes
//! of day under the pointer are `f64`, and scroll offsets are `f64` because the
//! infinite month axis' offsets outgrow `f32`'s exact range. Placed events keep
//! integer minutes, so overlap tests are exact.

mod day_range;
pub mod drag;
mod grid;
mod lane_geometry;
mod lanes;
mod month;
pub mod week_snap;

pub use day_range::{DayRangeLayout, DisplayMode, TimedPlacement, day_range_layout};
pub use grid::{GridDay, GridWeek, MonthGrid, month_grid, month_grid_bounds};
pub use lane_geometry::{
    BAR_BLEED, LANE_GAP, MonthRowMetrics, all_day_bar_rect, reserved_all_day_height,
};
pub use lanes::{AllDayLaneItem, AllDaySpan, assign_all_day_lanes, build_all_day_span};
pub use month::{MonthWeekLayout, month_event_layout, month_week_layout};

/// Days in a week row (month view).
pub const DAYS_PER_WEEK: usize = 7;

/// An axis-aligned rectangle by its edges, in one coordinate space (DOMRect's
/// shape; GPUI `Bounds` converts with `origin`/`size`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Rect {
    pub left: f32,
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
}

impl Rect {
    pub fn width(&self) -> f32 {
        self.right - self.left
    }

    pub fn height(&self) -> f32 {
        self.bottom - self.top
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

/// JS `Math.round`: halves round towards +∞ (Rust's `round` goes away from 0).
pub(crate) fn js_round(x: f64) -> f64 {
    (x + 0.5).floor()
}
