//! Event time primitives for renCal (port of `src/lib/event-time` and
//! `src/lib/cal-events*.ts`).
//!
//! Calendar data is not one kind of time; `EventTime` keeps the four shapes
//! calendar formats use (all-day date, UTC instant, floating wallclock, zoned
//! wallclock). App code uses the helpers here rather than converting to
//! instants or strings itself.
//!
//! The TS code read the viewer's zone and "today" from globals. Here both are
//! arguments (`viewer: Tz`, `today: NaiveDate`), so every function is pure.

mod date_info;
pub mod day;
pub mod display;
mod edit;
pub mod event;
mod projections;
mod range;
mod time;
pub mod tz;
pub mod zoned;

pub use chrono::{NaiveDate, NaiveDateTime};
pub use chrono_tz::Tz;

pub use date_info::EventDateInfo;
pub use day::{FirstDayOfWeek, date_from_epoch_day, epoch_day, iso_week_number, start_of_week};
pub use display::TimeFormat;
pub use edit::at_time;
pub use event::{Calendar, CalendarEvent, EventKey, event_key};
pub use time::{EventTime, EventTimeRange, ParseError, WireEventTime, parse_tz, zoned_offset};

pub mod constants {
    pub const DEFAULT_DURATION_MINS: i32 = 60;
    pub const HOUR_MINUTES: i32 = 60;
    pub const DAY_MINUTES: i32 = 24 * HOUR_MINUTES;
    pub const WEEK_MINUTES: i32 = 7 * DAY_MINUTES;
    /// App-level reminder months are fixed to 4 weeks, matching the backend cap.
    pub const MONTH_MINUTES: i32 = 4 * WEEK_MINUTES;
}

/// The current calendar day in the viewer's zone.
pub fn today(now: chrono::DateTime<chrono::Utc>, viewer: Tz) -> NaiveDate {
    now.with_timezone(&viewer).date_naive()
}
