//! Week/day time-grid layout (port of `useDayRangeLayout.ts`): spanning events
//! go to the all-day lanes, single-day timed events into their day column with
//! side-by-side overlap columns.

use rencal_time::constants::DAY_MINUTES;
use rencal_time::{CalendarEvent, EventDateInfo};

use crate::lanes::{AllDayLaneItem, assign_all_day_lanes, build_all_day_span};

/// How much a timed block shows, by duration. The thresholds are the shortest
/// durations whose block fits each mode's lines at 48px per hour.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum DisplayMode {
    Xs,
    Sm,
    Md,
    Lg,
}

impl DisplayMode {
    pub fn for_duration(minutes: i32) -> Self {
        match minutes {
            ..45 => Self::Xs,
            45..60 => Self::Sm,
            60..75 => Self::Md,
            _ => Self::Lg,
        }
    }
}

/// A single-day timed event in its day column.
///
/// Positions stay in whole viewer-local minutes (the TS code used percentages
/// and an epsilon); `top`/`height` give fractions of the 24h column.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct TimedPlacement {
    /// Index into the `events` slice the layout was built from.
    pub event: usize,
    pub start_minutes: i32,
    /// Clamped to midnight for an event that ends on a later day.
    pub duration_minutes: i32,
    /// 0-based overlap column within the collision group.
    pub column: usize,
    /// Columns in the collision group; the block's width is `1 / total_columns`.
    pub total_columns: usize,
    pub display_mode: DisplayMode,
}

impl TimedPlacement {
    fn new(event: usize, info: &EventDateInfo) -> Self {
        // An event ending on a later day (at midnight, since it isn't spanning)
        // runs to the end of the column.
        let duration_minutes = if info.end_day > info.first_day {
            DAY_MINUTES - info.start_local_minutes
        } else {
            info.end_local_minutes - info.start_local_minutes
        };
        Self {
            event,
            start_minutes: info.start_local_minutes,
            duration_minutes,
            column: 0,
            total_columns: 1,
            display_mode: DisplayMode::for_duration(duration_minutes),
        }
    }

    pub fn end_minutes(&self) -> i32 {
        self.start_minutes + self.duration_minutes
    }

    /// Top edge as a fraction of the day column.
    pub fn top(&self) -> f32 {
        self.start_minutes as f32 / DAY_MINUTES as f32
    }

    /// Height as a fraction of the day column.
    pub fn height(&self) -> f32 {
        self.duration_minutes as f32 / DAY_MINUTES as f32
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct DayRangeLayout {
    /// Sorted longest first, then by start column.
    pub all_day_items: Vec<AllDayLaneItem>,
    /// Lanes used by `all_day_items` (the TS `maxAllDayLane` plus one).
    pub all_day_lanes: usize,
    /// One list per day column, sorted by start then longest first.
    pub timed_by_day: Vec<Vec<TimedPlacement>>,
}

/// Lay out `events` over `day_count` consecutive days starting at epoch day
/// `first_day`. Events must have `date_info` for the viewer's zone.
pub fn day_range_layout(
    events: &[CalendarEvent],
    first_day: i32,
    day_count: usize,
) -> DayRangeLayout {
    if day_count == 0 {
        return DayRangeLayout::default();
    }
    let last_day = first_day + day_count as i32 - 1;

    let mut all_day_items = Vec::new();
    let mut timed_by_day = vec![Vec::new(); day_count];
    for (index, event) in events.iter().enumerate() {
        if event.is_spanning() {
            all_day_items.extend(build_all_day_span(index, event, first_day, last_day));
        } else if (first_day..=last_day).contains(&event.date_info.first_day) {
            let column = (event.date_info.first_day - first_day) as usize;
            timed_by_day[column].push(TimedPlacement::new(index, &event.date_info));
        }
    }

    for day in &mut timed_by_day {
        assign_overlap_columns(day);
    }
    let all_day_lanes = assign_all_day_lanes(&mut all_day_items, day_count);

    DayRangeLayout {
        all_day_items,
        all_day_lanes,
        timed_by_day,
    }
}

/// Greedy sweep: sort by start (longest first on ties), split into groups of
/// transitively overlapping events, and give each event the first column whose
/// previous event has ended. Every event in a group shares its column count.
fn assign_overlap_columns(day: &mut [TimedPlacement]) {
    day.sort_by(|a, b| {
        a.start_minutes
            .cmp(&b.start_minutes)
            .then(b.duration_minutes.cmp(&a.duration_minutes))
    });

    // End minute of the last event in each column of the current group.
    let mut column_ends: Vec<i32> = Vec::new();
    let mut group_start = 0;
    let mut group_end = i32::MIN;
    for i in 0..day.len() {
        let placement = day[i];
        if i > group_start && placement.start_minutes >= group_end {
            finish_group(&mut day[group_start..i], column_ends.len());
            column_ends.clear();
            group_start = i;
        }
        group_end = if i == group_start {
            placement.end_minutes()
        } else {
            group_end.max(placement.end_minutes())
        };

        let column = column_ends
            .iter()
            .position(|&end| end <= placement.start_minutes)
            .unwrap_or(column_ends.len());
        if column == column_ends.len() {
            column_ends.push(placement.end_minutes());
        } else {
            column_ends[column] = placement.end_minutes();
        }
        day[i].column = column;
    }
    finish_group(&mut day[group_start..], column_ends.len());
}

fn finish_group(group: &mut [TimedPlacement], total_columns: usize) {
    for placement in group {
        placement.total_columns = total_columns;
    }
}
