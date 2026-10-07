use super::helpers::to_calendar_event;
use super::types::CalendarEvent;
use crate::error::CoreResult;
use crate::state::AppState;
use caldir_core::EventInstanceId;

pub fn get_event(
    state: &AppState,
    calendar_slug: String,
    event_id: String,
) -> CoreResult<Option<CalendarEvent>> {
    let id = EventInstanceId::from(event_id);

    let parsed = state.events(&calendar_slug)?;
    Ok(parsed
        .iter()
        .find(|e| e.event_instance_id() == id)
        .map(|event| to_calendar_event(event, &calendar_slug, &parsed)))
}
