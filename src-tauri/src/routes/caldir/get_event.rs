use super::helpers::load_caldir;
use super::types::{CalendarEvent, core_recurrence_to_rpc};
use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use caldir_core::EventInstanceId;

pub(super) async fn handler(
    calendar_slug: String,
    event_id: String,
) -> TauResult<Option<CalendarEvent>> {
    let caldir = load_caldir()?;
    let id = EventInstanceId::from(event_id);

    let parsed = EVENT_CACHE.events(&caldir, &calendar_slug)?;
    let Some(event) = parsed.iter().find(|e| e.event_instance_id() == id) else {
        return Ok(None);
    };

    let master_rec = if event.recurrence_id.is_some() {
        parsed
            .iter()
            .find(|e| e.uid.as_str() == event.uid.as_str() && e.recurrence.is_some())
            .and_then(|master| master.recurrence.as_ref().map(core_recurrence_to_rpc))
    } else {
        None
    };

    Ok(Some(CalendarEvent::from_event(
        event,
        &calendar_slug,
        master_rec,
    )))
}
