use crate::error::CoreResult;
use crate::state::AppState;

pub fn delete_recurring_series(
    state: &AppState,
    calendar_slug: String,
    uid: String,
) -> CoreResult<()> {
    let calendar = state.caldir().calendar(&calendar_slug)?;

    // Find all events with this uid (parent + instances). The mutation path
    // needs the CalendarEvent wrapper (its `delete(self)` consumes the file
    // handle), so we re-read from disk rather than going through the cache.
    let events_to_delete: Vec<_> = calendar
        .events()?
        .into_iter()
        .filter(|ce| ce.event().uid.as_str() == uid)
        .collect();

    for ce in events_to_delete {
        ce.delete()?;
    }
    state.invalidate_events(&calendar_slug);
    Ok(())
}
