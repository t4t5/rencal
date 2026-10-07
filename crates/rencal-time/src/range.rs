//! Edits to an `EventTimeRange`, as the event editor applies them.

use chrono::{Duration, NaiveDate};
use chrono_tz::Tz;

use crate::edit::js_round;
use crate::{EventDateInfo, EventTime, EventTimeRange};

impl EventTimeRange {
    /// Make an all-day `[start, end)` valid: the end's day must be after the
    /// start's day.
    pub fn normalize_all_day(start: EventTime, end: EventTime, viewer: Tz) -> EventTimeRange {
        let end = if end.day(viewer) <= start.day(viewer) {
            start.add_days(1)
        } else {
            end
        };
        EventTimeRange { start, end }
    }

    /// Move the start's wallclock time, shifting a timed end by the same amount.
    pub fn with_start_wallclock_time(&self, hour: u32, minute: u32, viewer: Tz) -> EventTimeRange {
        let start = self.start.with_wallclock_time(hour, minute, viewer);
        let delta_ms = start.ordering_ms(viewer) - self.start.ordering_ms(viewer);
        let delta_minutes = js_round(delta_ms as f64 / 60_000.0);
        let end = if self.end.is_all_day() {
            self.end.clone()
        } else {
            self.end.add_minutes(delta_minutes)
        };
        EventTimeRange { start, end }
    }

    /// Move the end's wallclock time; a timed end that lands before the start
    /// rolls to the next day.
    pub fn with_end_wallclock_time(&self, hour: u32, minute: u32, viewer: Tz) -> EventTimeRange {
        let mut end = self.end.with_wallclock_time(hour, minute, viewer);
        if !self.start.is_all_day() && end.ordering_ms(viewer) < self.start.ordering_ms(viewer) {
            end = end.add_days(1);
        }
        EventTimeRange {
            start: self.start.clone(),
            end,
        }
    }

    /// Move the start to `date` (in the event's zone), shifting the end by the
    /// same number of days.
    pub fn with_start_date(&self, date: NaiveDate, viewer: Tz) -> EventTimeRange {
        let old = self.start.date_in_event_zone(viewer);
        let delta = (date - old).num_days();
        EventTimeRange {
            start: self.start.with_event_date(date, viewer),
            end: self.end.add_days(delta),
        }
    }

    /// Set the last displayed day. All-day ends are exclusive, so they become the
    /// next day (clamped to the start's date); timed ends take the date as is.
    pub fn with_display_end_date(&self, picked: NaiveDate, viewer: Tz) -> EventTimeRange {
        if self.start.is_all_day() {
            let start_date = self.start.date_in_event_zone(viewer);
            let clamped = picked.max(start_date);
            return EventTimeRange {
                start: self.start.clone(),
                end: EventTime::Date(clamped + Duration::days(1)),
            };
        }
        EventTimeRange {
            start: self.start.clone(),
            end: self.end.with_event_date(picked, viewer),
        }
    }

    /// The last day the editor shows (the exclusive all-day end minus one).
    pub fn display_end_date(&self, viewer: Tz) -> NaiveDate {
        if self.start.is_all_day() {
            self.end.add_days(-1).date_in_event_zone(viewer)
        } else {
            self.end.date_in_event_zone(viewer)
        }
    }

    /// Whether the editor shows a separate end date.
    pub fn should_show_display_end_date(&self, viewer: Tz) -> bool {
        self.start.is_all_day()
            || self.start.date_in_event_zone(viewer) != self.end.date_in_event_zone(viewer)
    }

    pub fn with_time_zone(&self, tz: Tz, viewer: Tz) -> EventTimeRange {
        EventTimeRange {
            start: self.start.with_event_time_zone(tz, viewer),
            end: self.end.with_event_time_zone(tz, viewer),
        }
    }

    pub fn with_viewer_zone(&self, viewer: Tz) -> EventTimeRange {
        EventTimeRange {
            start: self.start.with_viewer_zone(viewer),
            end: self.end.with_viewer_zone(viewer),
        }
    }

    pub fn date_info(&self, viewer: Tz) -> EventDateInfo {
        EventDateInfo::compute(&self.start, &self.end, viewer)
    }
}
