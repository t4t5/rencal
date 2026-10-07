//! Day cells for the month grid and the week/day views (port of
//! `useMonthGrid.ts`; its `MonthDay` is `GridDay` here since both views use it).

use chrono::{Datelike, Days, NaiveDate, Weekday};
use rencal_time::{FirstDayOfWeek, epoch_day, start_of_week};

use crate::DAYS_PER_WEEK;

/// One day cell.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct GridDay {
    pub date: NaiveDate,
    /// `epoch_day(date)`, the key layouts work in.
    pub epoch_day: i32,
    pub is_today: bool,
    pub is_weekend: bool,
}

impl GridDay {
    pub fn new(date: NaiveDate, today: NaiveDate) -> Self {
        Self {
            date,
            epoch_day: epoch_day(date),
            is_today: date == today,
            is_weekend: matches!(date.weekday(), Weekday::Sat | Weekday::Sun),
        }
    }
}

/// A month-view row.
pub type GridWeek = [GridDay; DAYS_PER_WEEK];

/// The weeks covering a month range.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MonthGrid {
    /// First day of the first row.
    pub grid_start: NaiveDate,
    /// First day of the week containing `range_end`; not part of the grid.
    pub grid_end: NaiveDate,
    pub weeks: Vec<GridWeek>,
}

/// The week starts bounding `[range_start, range_end)`. `range_end`'s own week
/// is excluded, so a range ending on the 1st of a month never adds a row of the
/// next month.
pub fn month_grid_bounds(
    range_start: NaiveDate,
    range_end: NaiveDate,
    first_day: FirstDayOfWeek,
) -> (NaiveDate, NaiveDate) {
    (
        start_of_week(range_start, first_day),
        start_of_week(range_end, first_day),
    )
}

/// Weeks covering `[range_start, range_end)`. Both are normally the 1st of a
/// month.
pub fn month_grid(
    range_start: NaiveDate,
    range_end: NaiveDate,
    first_day: FirstDayOfWeek,
    today: NaiveDate,
) -> MonthGrid {
    let (grid_start, grid_end) = month_grid_bounds(range_start, range_end, first_day);
    let weeks = grid_start
        .iter_weeks()
        .take_while(|start| *start < grid_end)
        .map(|start| std::array::from_fn(|d| GridDay::new(start + Days::new(d as u64), today)))
        .collect();
    MonthGrid {
        grid_start,
        grid_end,
        weeks,
    }
}
