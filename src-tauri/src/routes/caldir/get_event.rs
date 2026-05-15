use super::types::{CalendarEvent, core_recurrence_to_rpc};
use crate::routes::TauResult;
use caldir_core::{Caldir, EventInstanceId};

pub(super) async fn handler(
    calendar_slug: String,
    event_id: String,
) -> TauResult<Option<CalendarEvent>> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let calendar = caldir.calendar(&calendar_slug).map_err(|e| e.to_string())?;

    let id: EventInstanceId = event_id.parse().map_err(|e: String| e)?;
    let Some(found) = calendar
        .event_by_instance_id(&id)
        .map_err(|e| e.to_string())?
    else {
        return Ok(None);
    };

    let event = found.event();
    let master_rec = if event.recurrence_id.is_some() {
        calendar
            .master_event_for(event.uid.as_str())
            .map_err(|e| e.to_string())?
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
