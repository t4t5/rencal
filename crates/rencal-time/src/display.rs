//! English display strings. These reproduce the en-GB `Intl.DateTimeFormat`
//! output the TS app used (and en-US for 12-hour times), byte for byte.

use chrono::{Datelike, NaiveDate, Timelike};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};

use crate::EventTime;
use crate::day::epoch_day;

/// The 12h/24h setting.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TimeFormat {
    #[default]
    #[serde(rename = "24h")]
    H24,
    #[serde(rename = "12h")]
    H12,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DatePartStyle {
    Short,
    Long,
}

const WEEKDAYS_LONG: [&str; 7] = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
];
const WEEKDAYS_SHORT: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS_LONG: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];
/// en-GB abbreviations; ICU spells September "Sept".
const MONTHS_SHORT: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec",
];

pub fn format_weekday(date: NaiveDate, style: DatePartStyle) -> &'static str {
    let index = date.weekday().num_days_from_monday() as usize;
    match style {
        DatePartStyle::Short => WEEKDAYS_SHORT[index],
        DatePartStyle::Long => WEEKDAYS_LONG[index],
    }
}

pub fn format_month(date: NaiveDate, style: DatePartStyle) -> &'static str {
    let index = date.month0() as usize;
    match style {
        DatePartStyle::Short => MONTHS_SHORT[index],
        DatePartStyle::Long => MONTHS_LONG[index],
    }
}

fn year_suffix(date: NaiveDate, today: NaiveDate) -> String {
    if date.year() == today.year() {
        String::new()
    } else {
        format!(" {}", date.year())
    }
}

/// `YYYY-MM-DD` of the viewer-local date; the stable grouping key.
pub fn format_date_key(date: NaiveDate) -> String {
    date.to_string()
}

fn twelve_hour(hour: u32) -> (u32, &'static str) {
    let h12 = match hour % 12 {
        0 => 12,
        h => h,
    };
    (h12, if hour < 12 { "AM" } else { "PM" })
}

/// "09:30" (24h) or "09:30 AM" (12h, 2-digit hour like `Intl` en-US) in the
/// viewer's zone. Empty for all-day dates.
pub fn format_time(time: &EventTime, format: TimeFormat, viewer: Tz) -> String {
    if time.is_all_day() {
        return String::new();
    }
    let z = time.to_viewer_zoned(viewer);
    let (hour, minute) = (z.hour(), z.minute());
    match format {
        TimeFormat::H24 => format!("{hour:02}:{minute:02}"),
        TimeFormat::H12 => {
            let (h12, period) = twelve_hour(hour);
            format!("{h12:02}:{minute:02} {period}")
        }
    }
}

/// A wallclock hour (0–23) and minute per the setting: "15:30" or "3:30 PM".
/// Zone-agnostic, for time-picker labels with no underlying `EventTime`.
pub fn format_wallclock_time(hour: u32, minute: u32, format: TimeFormat) -> String {
    match format {
        TimeFormat::H24 => format!("{hour:02}:{minute:02}"),
        TimeFormat::H12 => {
            let (h12, period) = twelve_hour(hour);
            format!("{h12}:{minute:02} {period}")
        }
    }
}

/// "Mon, 28 Apr", or "Mon, 28 Apr 2027" outside the current year.
pub fn format_short_date(date: NaiveDate, today: NaiveDate) -> String {
    format!(
        "{}, {} {}{}",
        format_weekday(date, DatePartStyle::Short),
        date.day(),
        format_month(date, DatePartStyle::Short),
        year_suffix(date, today)
    )
}

/// "Thursday, 5 November", plus the year outside the current year.
pub fn format_long_date(date: NaiveDate, today: NaiveDate) -> String {
    format!(
        "{}, {} {}{}",
        format_weekday(date, DatePartStyle::Long),
        date.day(),
        format_month(date, DatePartStyle::Long),
        year_suffix(date, today)
    )
}

/// "28 Apr", or "28 Apr 2027" outside the current year.
pub fn format_day_month(date: NaiveDate, today: NaiveDate) -> String {
    format!(
        "{} {}{}",
        date.day(),
        format_month(date, DatePartStyle::Short),
        year_suffix(date, today)
    )
}

/// "Today" / "Tomorrow" / "Yesterday", else the long weekday name.
pub fn relative_day_label(date: NaiveDate, today: NaiveDate) -> String {
    match epoch_day(date) - epoch_day(today) {
        0 => "Today".into(),
        1 => "Tomorrow".into(),
        -1 => "Yesterday".into(),
        _ => format_weekday(date, DatePartStyle::Long).into(),
    }
}
