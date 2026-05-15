use super::helpers::sort_by_proximity_to_now;
use super::types::CalendarEvent;
use crate::routes::TauResult;
use caldir_core::Caldir;

pub(super) async fn handler(
    calendar_slugs: Vec<String>,
    query: String,
) -> TauResult<Vec<CalendarEvent>> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let mut events = Vec::new();
    let query_lower = query.to_lowercase();

    for slug in &calendar_slugs {
        let calendar = caldir.calendar(slug).map_err(|e| e.to_string())?;
        for ce in calendar.events().map_err(|e| e.to_string())? {
            let event = ce.event();
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
