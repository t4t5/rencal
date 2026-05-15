use super::helpers::event_time_sort_key;
use super::types::{CalendarEvent, RpcRecurrence, core_recurrence_to_rpc};
use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use caldir_core::{Caldir, expand_in_range};
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
        let parsed = EVENT_CACHE.events(&caldir, slug)?;
        let master_recurrences: HashMap<String, RpcRecurrence> = parsed
            .iter()
            .filter_map(|e| {
                e.recurrence
                    .as_ref()
                    .map(|r| (e.uid.as_str().to_string(), core_recurrence_to_rpc(r)))
            })
            .collect();

        for event in expand_in_range(parsed.iter().cloned(), range_start, range_end) {
            let master_rec = master_recurrences.get(event.uid.as_str()).cloned();
            events.push(CalendarEvent::from_event(&event, slug, master_rec));
        }
    }

    events.sort_by_key(|a| event_time_sort_key(&a.start));
    Ok(events)
}
