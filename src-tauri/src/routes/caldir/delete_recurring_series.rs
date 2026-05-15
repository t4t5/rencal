use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use caldir_core::Caldir;

pub(super) async fn handler(calendar_slug: String, uid: String) -> TauResult<()> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let calendar = caldir.calendar(&calendar_slug).map_err(|e| e.to_string())?;

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
    EVENT_CACHE.invalidate(&calendar_slug);
    Ok(())
}
