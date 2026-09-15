use crate::routes::TauResult;
use crate::state::AppState;

pub(super) fn handler(state: &AppState, calendar_slug: String, uid: String) -> TauResult<()> {
    let calendar = state
        .caldir()
        .calendar(&calendar_slug)
        .map_err(|e| e.to_string())?;

    // Find all events with this uid (parent + instances). The mutation path
    // needs the CalendarEvent wrapper (its `delete(self)` consumes the file
    // handle), so we re-read from disk rather than going through the cache.
    let events_to_delete: Vec<_> = calendar
        .events()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|ce| ce.event().uid.as_str() == uid)
        .collect();

    for ce in events_to_delete {
        ce.delete().map_err(|e| e.to_string())?;
    }
    state.events.invalidate(&calendar_slug);
    Ok(())
}
