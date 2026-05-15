use super::helpers::event_time_sort_key;
use super::types::{CalendarEvent, RpcRecurrence, core_recurrence_to_rpc};
use crate::routes::TauResult;
use caldir_core::Caldir;
use chrono::{DateTime, Utc};
use std::collections::HashMap;

pub(super) async fn handler(
    calendar_slugs: Vec<String>,
    start: String,
    end: String,
) -> TauResult<Vec<CalendarEvent>> {
    let range_start: DateTime<Utc> = start
        .parse()
        .map_err(|e: chrono::ParseError| e.to_string())?;
    let range_end: DateTime<Utc> = end
        .parse()
        .map_err(|e: chrono::ParseError| e.to_string())?;

    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let mut events = Vec::new();

    for slug in &calendar_slugs {
        let calendar = caldir.calendar(slug).map_err(|e| e.to_string())?;

        // Build a map of master recurrences keyed by uid so each expanded
        // instance can carry its master's recurrence for the frontend.
        let all_events = calendar.events().map_err(|e| e.to_string())?;
        let master_recurrences: HashMap<String, RpcRecurrence> = all_events
            .iter()
            .filter_map(|ce| {
                ce.event()
                    .recurrence
                    .as_ref()
                    .map(|r| (ce.event().uid.as_str().to_string(), core_recurrence_to_rpc(r)))
            })
            .collect();

        for event in calendar
            .expanded_events_in_range(range_start, range_end)
            .map_err(|e| e.to_string())?
        {
            let master_rec = master_recurrences.get(event.uid.as_str()).cloned();
            events.push(CalendarEvent::from_event(&event, slug, master_rec));
        }
    }

    events.sort_by_key(|a| event_time_sort_key(&a.start));
    Ok(events)
}
