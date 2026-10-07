//! Editing one occurrence of a series (port of `src/lib/recurrence-edit.ts`).

use rencal_time::{EventTime, EventTimeRange, Tz};

/// Move an edited occurrence's range back to the master's anchor date, for
/// saving an "all events" edit onto the master. The occurrence supplies the
/// shape (times, zone, whether it is all-day); the master supplies the date.
pub fn anchor_range_to_recurring_master(
    current: &EventTimeRange,
    master_start: &EventTime,
    viewer: Tz,
) -> EventTimeRange {
    current.with_start_date(master_start.date_in_event_zone(viewer), viewer)
}
