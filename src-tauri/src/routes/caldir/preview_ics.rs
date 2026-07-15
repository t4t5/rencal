use super::types::CalendarEvent;
use crate::routes::TauResult;
use caldir_core::Event;

/// Parse an .ics file on disk into RPC events for the preview window.
/// The events don't belong to any calendar yet, so `calendar_slug` is empty.
pub(super) async fn handler(path: String) -> TauResult<Vec<CalendarEvent>> {
    let contents =
        std::fs::read_to_string(&path).map_err(|e| format!("Could not read '{path}': {e}"))?;

    let parsed = Event::from_ics_str(&contents).map_err(|e| e.to_string())?;

    let events: Vec<CalendarEvent> = parsed
        .into_iter()
        .filter_map(|result| match result {
            Ok(event) => Some(CalendarEvent::from_event(&event, "", None)),
            Err(e) => {
                log::warn!("skipping unparseable event in '{path}': {e}");
                None
            }
        })
        .collect();

    if events.is_empty() {
        return Err(format!("No events found in '{path}'"));
    }

    Ok(events)
}
