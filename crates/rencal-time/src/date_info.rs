//! `EventDateInfo`: numeric projections of an event's start/end, computed once
//! per event (and again when the viewer's zone changes) so the layout hot loops
//! sort, group by day and place events without zone maths.

use chrono::{NaiveTime, Timelike};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};

use crate::EventTime;
use crate::day::epoch_day;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventDateInfo {
    /// Start projection in epoch ms; the sort key.
    pub start_ms: i64,
    /// End projection in epoch ms; with `start_ms`, whether an event is ongoing.
    pub end_ms: i64,
    /// Epoch day of the start in the viewer's zone.
    pub first_day: i32,
    /// Epoch day of the last occupied day, aware of iCal's exclusive ends.
    pub last_day: i32,
    /// Epoch day of the end, before the exclusive-end adjustment.
    pub end_day: i32,
    /// Wallclock minutes of day at start, in the viewer's zone (0 for all-day).
    pub start_local_minutes: i32,
    /// Wallclock minutes of day at end, in the viewer's zone (0 for all-day).
    pub end_local_minutes: i32,
}

impl EventTime {
    /// Epoch day of the viewer-local calendar day this time sits on.
    pub fn day(&self, viewer: Tz) -> i32 {
        epoch_day(self.date_in_viewer_zone(viewer))
    }
}

impl EventDateInfo {
    pub fn compute(start: &EventTime, end: &EventTime, viewer: Tz) -> Self {
        let first_day = start.day(viewer);
        let end_day = end.day(viewer);

        let ends_at_day_boundary =
            start.is_all_day() || end.to_viewer_zoned(viewer).time() == NaiveTime::MIN;
        let last_day = if ends_at_day_boundary && end_day > first_day {
            end_day - 1
        } else {
            end_day
        };

        let (start_local_minutes, end_local_minutes) = if start.is_all_day() {
            (0, 0)
        } else {
            let minutes = |t: &EventTime| {
                let z = t.to_viewer_zoned(viewer);
                (z.hour() * 60 + z.minute()) as i32
            };
            (minutes(start), minutes(end))
        };

        Self {
            start_ms: start.ordering_ms(viewer),
            end_ms: end.ordering_ms(viewer),
            first_day,
            last_day,
            end_day,
            start_local_minutes,
            end_local_minutes,
        }
    }

    /// Every viewer-local day the event occupies, first to last. An event whose
    /// end precedes its start still occupies its start day.
    pub fn occupied_days(&self) -> std::ops::RangeInclusive<i32> {
        self.first_day..=self.first_day.max(self.last_day)
    }

    /// Whether the event covers `day` (one it occupies) from midnight to
    /// midnight. All-day events cover every occupied day; a timed event only
    /// when it passes over the day without starting or ending inside it. A start
    /// within the first minute after midnight counts as midnight.
    pub fn covers_full_day(&self, start: &EventTime, day: i32) -> bool {
        if start.is_all_day() {
            return true;
        }
        let starts_by_midnight =
            self.first_day < day || (self.first_day == day && self.start_local_minutes == 0);
        starts_by_midnight && self.end_day > day
    }
}
