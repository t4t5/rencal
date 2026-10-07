//! Calendar-day keys and week helpers.

use chrono::{Datelike, Duration, NaiveDate};
use serde::{Deserialize, Serialize};

/// Days from 0001-01-01 (chrono's CE day 1) to 1970-01-01.
const UNIX_EPOCH_CE_DAYS: i32 = 719_163;

/// A timezone-independent integer key for a calendar day: days since 1970-01-01.
pub fn epoch_day(date: NaiveDate) -> i32 {
    date.num_days_from_ce() - UNIX_EPOCH_CE_DAYS
}

/// Inverse of `epoch_day`.
pub fn date_from_epoch_day(day: i32) -> NaiveDate {
    NaiveDate::from_num_days_from_ce_opt(day + UNIX_EPOCH_CE_DAYS)
        .expect("epoch day within chrono's date range")
}

/// `YYYY-MM-DD` key for an epoch day.
pub fn date_key_from_epoch_day(day: i32) -> String {
    date_from_epoch_day(day).to_string()
}

/// Which weekday starts a week row (the `first_day_of_week` setting).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FirstDayOfWeek {
    #[default]
    Monday,
    Sunday,
}

/// The day that begins the week containing `date`.
pub fn start_of_week(date: NaiveDate, first_day: FirstDayOfWeek) -> NaiveDate {
    let since_start = match first_day {
        FirstDayOfWeek::Monday => date.weekday().num_days_from_monday(),
        FirstDayOfWeek::Sunday => date.weekday().num_days_from_sunday(),
    };
    date - Duration::days(i64::from(since_start))
}

/// ISO 8601 week number of the displayed week row containing `date`.
///
/// ISO weeks run Monday–Sunday, so a Sunday-first row straddles two ISO weeks;
/// the row is numbered by its Thursday, which is ISO-correct for Monday-first
/// rows and matches how other calendars label Sunday-first rows.
pub fn iso_week_number(date: NaiveDate, first_day: FirstDayOfWeek) -> u32 {
    let to_thursday = match first_day {
        FirstDayOfWeek::Monday => 3,
        FirstDayOfWeek::Sunday => 4,
    };
    (start_of_week(date, first_day) + Duration::days(to_thursday))
        .iso_week()
        .week()
}

/// ISO weekday number, Monday = 1 … Sunday = 7 (Temporal's `dayOfWeek`).
pub fn day_of_week(date: NaiveDate) -> u32 {
    date.weekday().number_from_monday()
}

/// First day of `date`'s month plus `months` (negative allowed).
pub fn add_months_to_month_start(date: NaiveDate, months: i32) -> NaiveDate {
    let index = date.year() * 12 + date.month0() as i32 + months;
    NaiveDate::from_ymd_opt(index.div_euclid(12), index.rem_euclid(12) as u32 + 1, 1)
        .expect("first of month is valid")
}
