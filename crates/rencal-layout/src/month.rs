//! Month-view rows (port of `useMonthEventLayout.ts`): per week, spanning events
//! as lane bars and single-day timed events listed per day cell.

use rencal_time::CalendarEvent;

use crate::DAYS_PER_WEEK;
use crate::lanes::{AllDayLaneItem, assign_all_day_lanes, build_all_day_span};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct MonthWeekLayout {
    /// Sorted longest first, then by start column.
    pub all_day_items: Vec<AllDayLaneItem>,
    /// Lanes used by `all_day_items` (the TS `maxLane` plus one).
    pub lanes: usize,
    /// Indexes into `events` of each day cell's single-day timed events, by
    /// start instant (input order on ties).
    pub timed_by_col: [Vec<usize>; DAYS_PER_WEEK],
}

/// Layout of the week row starting at epoch day `week_start`. Events must have
/// `date_info` for the viewer's zone.
pub fn month_week_layout(events: &[CalendarEvent], week_start: i32) -> MonthWeekLayout {
    let week_end = week_start + DAYS_PER_WEEK as i32 - 1;
    let mut all_day_items = Vec::new();
    let mut timed_by_col: [Vec<usize>; DAYS_PER_WEEK] = Default::default();

    for (index, event) in events.iter().enumerate() {
        if event.is_spanning() {
            all_day_items.extend(build_all_day_span(index, event, week_start, week_end));
        } else if (week_start..=week_end).contains(&event.date_info.first_day) {
            timed_by_col[(event.date_info.first_day - week_start) as usize].push(index);
        }
    }

    for col in &mut timed_by_col {
        col.sort_by_key(|&index| events[index].date_info.start_ms);
    }
    let lanes = assign_all_day_lanes(&mut all_day_items, DAYS_PER_WEEK);

    MonthWeekLayout {
        all_day_items,
        lanes,
        timed_by_col,
    }
}

/// `month_week_layout` for each row starting at the given epoch days.
pub fn month_event_layout(
    events: &[CalendarEvent],
    week_starts: impl IntoIterator<Item = i32>,
) -> Vec<MonthWeekLayout> {
    week_starts
        .into_iter()
        .map(|start| month_week_layout(events, start))
        .collect()
}
