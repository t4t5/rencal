//! Search result ordering (port of `src/lib/search-results.ts`).

use chrono::{DateTime, Utc};
use rencal_time::{CalendarEvent, Tz};

use crate::recurrence::with_nearest_occurrence;

/// Show recurring masters at their nearest occurrence, then order every result
/// by how far its displayed start is from `now` (stable for ties).
pub fn prepare_search_results(
    events: Vec<CalendarEvent>,
    now: DateTime<Utc>,
    viewer: Tz,
) -> Vec<CalendarEvent> {
    let now_ms = now.timestamp_millis();
    let viewer_now = now.with_timezone(&viewer).naive_local();
    let mut events: Vec<CalendarEvent> = events
        .into_iter()
        .map(|event| with_nearest_occurrence(event, viewer_now, viewer))
        .collect();
    events.sort_by_key(|e| (e.date_info.start_ms - now_ms).abs());
    events
}
