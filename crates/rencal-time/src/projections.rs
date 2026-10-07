//! Views of an `EventTime` in the viewer's zone.

use chrono::{DateTime, NaiveDate, Utc};
use chrono_tz::Tz;

use crate::EventTime;
use crate::zoned::{resolve_local, start_of_day};

impl EventTime {
    /// A real instant for ordering and layout math. All-day and floating times
    /// carry no instant, so they are anchored in the viewer's zone. Use only
    /// when a numeric comparison key is needed.
    pub fn instant_for_ordering(&self, viewer: Tz) -> DateTime<Utc> {
        match self {
            Self::Date(date) => start_of_day(*date, viewer).to_utc(),
            Self::Utc(instant) => *instant,
            Self::Floating(wallclock) => resolve_local(*wallclock, viewer).to_utc(),
            Self::Zoned(dt) => dt.to_utc(),
        }
    }

    /// `instant_for_ordering` as epoch milliseconds.
    pub fn ordering_ms(&self, viewer: Tz) -> i64 {
        self.instant_for_ordering(viewer).timestamp_millis()
    }

    /// The value as a datetime in the viewer's zone, for rendering and for maths
    /// expressed in the viewer's clock. All-day dates map to their start of day.
    pub fn to_viewer_zoned(&self, viewer: Tz) -> DateTime<Tz> {
        match self {
            Self::Date(date) => start_of_day(*date, viewer),
            Self::Utc(instant) => instant.with_timezone(&viewer),
            Self::Floating(wallclock) => resolve_local(*wallclock, viewer),
            Self::Zoned(dt) => dt.with_timezone(&viewer),
        }
    }

    /// The viewer-local calendar date this time sits on. All-day dates are
    /// returned as they are.
    pub fn date_in_viewer_zone(&self, viewer: Tz) -> NaiveDate {
        match self {
            Self::Date(date) => *date,
            _ => self.to_viewer_zoned(viewer).date_naive(),
        }
    }

    pub fn is_same_day(&self, other: &EventTime, viewer: Tz) -> bool {
        self.date_in_viewer_zone(viewer) == other.date_in_viewer_zone(viewer)
    }
}
