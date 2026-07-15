use super::types::{CalendarEvent, IcsPreview};
use crate::routes::TauResult;
use caldir_core::Event;

/// Parse an .ics file on disk into RPC events for the preview window.
/// The events don't belong to any calendar yet, so `calendar_slug` is empty.
pub(super) async fn handler(path: String) -> TauResult<IcsPreview> {
    let contents =
        std::fs::read_to_string(&path).map_err(|e| format!("Could not read '{path}': {e}"))?;

    let parsed = Event::from_ics_str(&contents).map_err(|e| e.to_string())?;

    let mut events = Vec::new();
    let mut override_count = 0;
    let mut skipped_count = 0;

    for result in parsed {
        match result {
            Ok(event) => {
                if event.recurrence_id.is_some() {
                    override_count += 1;
                } else {
                    events.push(CalendarEvent::from_event(&event, "", None));
                }
            }
            Err(e) => {
                skipped_count += 1;
                log::warn!("skipping unparseable event in '{path}': {e}");
            }
        }
    }

    if events.is_empty() {
        return Err(format!("No events found in '{path}'"));
    }

    Ok(IcsPreview {
        events,
        override_count,
        skipped_count,
    })
}
