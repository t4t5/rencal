use super::helpers::{load_caldir, to_calendar_event};
use super::types::CalendarEvent;
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
    Ok(parsed
        .iter()
        .find(|e| e.event_instance_id() == id)
        .map(|event| to_calendar_event(event, &calendar_slug, &parsed)))
}
