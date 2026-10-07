//! All-day lanes (port of `all-day-lanes.ts`): spanning events become bars
//! clipped to a row of day columns, then stack greedily into lanes.

use rencal_time::CalendarEvent;

/// A bar's columns within a row. Columns are 0-based with an exclusive end (the
/// TS code used 1-based CSS grid lines: `startCol = start_col + 1`,
/// `endCol = end_col + 1`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct AllDaySpan {
    pub start_col: usize,
    pub end_col: usize,
    /// The event starts inside the row (not clipped on the left).
    pub is_start: bool,
    /// The event ends inside the row (not clipped on the right).
    pub is_end: bool,
}

impl AllDaySpan {
    /// Clip the inclusive epoch-day span `[first_day, last_day]` to the row
    /// `[range_first_day, range_last_day]`; `None` when they don't overlap.
    pub fn clip(
        first_day: i32,
        last_day: i32,
        range_first_day: i32,
        range_last_day: i32,
    ) -> Option<Self> {
        if first_day > range_last_day || last_day < range_first_day {
            return None;
        }
        let clamped_first = first_day.max(range_first_day);
        let clamped_last = last_day.min(range_last_day);
        Some(Self {
            start_col: (clamped_first - range_first_day) as usize,
            end_col: (clamped_last - range_first_day + 1) as usize,
            is_start: first_day >= range_first_day,
            is_end: last_day <= range_last_day,
        })
    }

    /// Columns covered; negative for a malformed event that ends before it starts.
    pub fn width(&self) -> isize {
        self.end_col as isize - self.start_col as isize
    }
}

/// A bar placed in a lane. `event` is whatever the caller tracks bars by: the
/// layouts use the event's index in their input slice; the month row adds its
/// drag-to-create selection with its own marker.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct AllDayLaneItem<T = usize> {
    pub event: T,
    pub span: AllDaySpan,
    /// 0-based lane; set by `assign_all_day_lanes`.
    pub lane: usize,
}

/// The lane item for `event` (identified by `index`) in the row
/// `[range_first_day, range_last_day]`, or `None` when it misses the row.
pub fn build_all_day_span(
    index: usize,
    event: &CalendarEvent,
    range_first_day: i32,
    range_last_day: i32,
) -> Option<AllDayLaneItem> {
    let info = &event.date_info;
    AllDaySpan::clip(
        info.first_day,
        info.last_day,
        range_first_day,
        range_last_day,
    )
    .map(|span| AllDayLaneItem {
        event: index,
        span,
        lane: 0,
    })
}

/// Sort `items` longest first (then by start column, stable for ties) and put
/// each in the first lane where all its columns are free. Returns the number of
/// lanes used (the TS `maxLane` plus one).
pub fn assign_all_day_lanes<T>(items: &mut [AllDayLaneItem<T>], column_count: usize) -> usize {
    items.sort_by(|a, b| {
        b.span
            .width()
            .cmp(&a.span.width())
            .then(a.span.start_col.cmp(&b.span.start_col))
    });

    // Row-major occupancy, one row of `column_count` cells per lane.
    let mut occupied: Vec<bool> = Vec::new();
    let mut lanes = 0;
    for item in items.iter_mut() {
        let start = item.span.start_col.min(column_count);
        let columns = start..item.span.end_col.clamp(start, column_count);
        let mut lane = 0;
        while lane < lanes {
            let row = &occupied[lane * column_count..][..column_count];
            if row[columns.clone()].iter().all(|taken| !taken) {
                break;
            }
            lane += 1;
        }
        if lane == lanes {
            lanes += 1;
            occupied.resize(lanes * column_count, false);
        }
        occupied[lane * column_count..][columns].fill(true);
        item.lane = lane;
    }
    lanes
}
