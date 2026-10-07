//! Edits to a single `EventTime`. Each keeps the value's kind (and zone) unless
//! its name says otherwise.

use chrono::{Duration, NaiveDate, Timelike};
use chrono_tz::Tz;

use crate::EventTime;
use crate::constants::DAY_MINUTES;
use crate::zoned::{self, resolve_local, start_of_day};

/// JS `Math.round`: halves round towards +∞.
pub(crate) fn js_round(x: f64) -> i64 {
    (x + 0.5).floor() as i64
}

impl EventTime {
    /// Promote an all-day date to a timed value at the start of that date in the
    /// viewer's zone (toggling all-day off).
    pub fn to_timed_at_start_of_day(&self, viewer: Tz) -> EventTime {
        match self {
            Self::Date(date) => Self::Zoned(start_of_day(*date, viewer)),
            other => other.clone(),
        }
    }

    /// Demote a timed value to its viewer-local date (toggling all-day on).
    pub fn to_all_day(&self, viewer: Tz) -> EventTime {
        Self::Date(self.date_in_viewer_zone(viewer))
    }

    /// The same instant, zoned in the viewer's zone. All-day dates pass through.
    /// Seeds a new event from an existing one so the draft reads in the viewer's
    /// clock rather than the source event's zone.
    pub fn with_viewer_zone(&self, viewer: Tz) -> EventTime {
        match self {
            Self::Date(_) => self.clone(),
            _ => Self::Zoned(self.to_viewer_zoned(viewer)),
        }
    }

    /// Exact-time addition. All-day dates move by whole days (rounded).
    pub fn add_minutes(&self, minutes: i64) -> EventTime {
        let delta = Duration::minutes(minutes);
        match self {
            Self::Date(date) => {
                let days = js_round(minutes as f64 / f64::from(DAY_MINUTES));
                Self::Date(*date + Duration::days(days))
            }
            Self::Utc(instant) => Self::Utc(*instant + delta),
            Self::Floating(wallclock) => Self::Floating(*wallclock + delta),
            Self::Zoned(dt) => Self::Zoned(*dt + delta),
        }
    }

    /// Calendar-day addition: zoned values keep their wallclock across DST.
    pub fn add_days(&self, days: i64) -> EventTime {
        match self {
            Self::Date(date) => Self::Date(*date + Duration::days(days)),
            Self::Utc(instant) => Self::Utc(*instant + Duration::days(days)),
            Self::Floating(wallclock) => Self::Floating(*wallclock + Duration::days(days)),
            Self::Zoned(dt) => Self::Zoned(zoned::add_days(dt, days)),
        }
    }

    /// The date in the value's own zone (the viewer's for UTC). Editing UI uses
    /// this so a Stockholm viewer sees an LA-zoned event's LA date.
    pub fn date_in_event_zone(&self, viewer: Tz) -> NaiveDate {
        match self {
            Self::Date(date) => *date,
            Self::Zoned(dt) => dt.date_naive(),
            Self::Floating(wallclock) => wallclock.date(),
            Self::Utc(_) => self.date_in_viewer_zone(viewer),
        }
    }

    /// `(hour, minute)` in the value's own zone (the viewer's for UTC); 00:00 for
    /// all-day dates.
    pub fn wallclock_time(&self, viewer: Tz) -> (u32, u32) {
        match self {
            Self::Date(_) => (0, 0),
            Self::Zoned(dt) => (dt.hour(), dt.minute()),
            Self::Floating(wallclock) => (wallclock.hour(), wallclock.minute()),
            Self::Utc(_) => {
                let z = self.to_viewer_zoned(viewer);
                (z.hour(), z.minute())
            }
        }
    }

    /// Replace the wallclock hour/minute in the value's own zone, zeroing the
    /// seconds. No-op for all-day dates.
    pub fn with_wallclock_time(&self, hour: u32, minute: u32, viewer: Tz) -> EventTime {
        match self {
            Self::Date(_) => self.clone(),
            Self::Zoned(dt) => Self::Zoned(zoned::with_time(dt, hour, minute)),
            Self::Floating(wallclock) => {
                Self::Floating(zoned::with_wallclock_time(*wallclock, hour, minute))
            }
            Self::Utc(_) => {
                let z = zoned::with_time(&self.to_viewer_zoned(viewer), hour, minute);
                Self::Utc(z.to_utc())
            }
        }
    }

    /// Replace the calendar date, keeping the wallclock and zone.
    pub fn with_event_date(&self, date: NaiveDate, viewer: Tz) -> EventTime {
        match self {
            Self::Date(_) => Self::Date(date),
            Self::Zoned(dt) => Self::Zoned(zoned::with_date(dt, date)),
            Self::Floating(wallclock) => Self::Floating(date.and_time(wallclock.time())),
            Self::Utc(_) => {
                let z = zoned::with_date(&self.to_viewer_zoned(viewer), date);
                Self::Utc(z.to_utc())
            }
        }
    }

    /// The stored zone, or the viewer's for values without one.
    pub fn event_tz(&self, viewer: Tz) -> Tz {
        match self {
            Self::Zoned(dt) => dt.timezone(),
            _ => viewer,
        }
    }

    /// Move to `tz`, keeping the displayed wallclock (not the instant). The
    /// result is zoned; all-day dates pass through.
    pub fn with_event_time_zone(&self, tz: Tz, viewer: Tz) -> EventTime {
        match self {
            Self::Date(_) => self.clone(),
            Self::Zoned(dt) => Self::zoned(dt.naive_local(), tz),
            Self::Floating(wallclock) => Self::zoned(*wallclock, tz),
            Self::Utc(_) => Self::zoned(self.to_viewer_zoned(viewer).naive_local(), tz),
        }
    }
}

/// A timed value on `date` at `hour:minute` in the viewer's zone.
pub fn at_time(date: NaiveDate, hour: u32, minute: u32, viewer: Tz) -> EventTime {
    let wallclock = date
        .and_hms_opt(hour.min(23), minute.min(59), 0)
        .expect("clamped time is valid");
    EventTime::Zoned(resolve_local(wallclock, viewer))
}
