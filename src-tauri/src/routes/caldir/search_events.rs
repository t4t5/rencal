use super::helpers::load_caldir;
use super::helpers::{is_visible, sort_by_proximity_to_now};
use super::types::CalendarEvent;
use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;

pub(super) async fn handler(
    calendar_slugs: Vec<String>,
    query: String,
) -> TauResult<Vec<CalendarEvent>> {
    let caldir = load_caldir()?;
    let mut events = Vec::new();
    let query_lower = query.to_lowercase();

    for slug in &calendar_slugs {
        let parsed = EVENT_CACHE.events(&caldir, slug)?;
        for event in parsed.iter() {
            if !is_visible(event) {
                continue;
            }
            let summary_match = event
                .summary
                .as_deref()
                .unwrap_or("")
                .to_lowercase()
                .contains(&query_lower);
            if summary_match {
                events.push(CalendarEvent::from_event(event, slug, None));
            }
        }
    }

    sort_by_proximity_to_now(&mut events);
    Ok(events)
}
