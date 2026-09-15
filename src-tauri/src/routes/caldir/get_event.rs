use super::helpers::to_calendar_event;
use super::types::CalendarEvent;
use crate::routes::TauResult;
use crate::state::AppState;
use caldir_core::EventInstanceId;

pub(super) fn handler(
    state: &AppState,
    calendar_slug: String,
    event_id: String,
) -> TauResult<Option<CalendarEvent>> {
    let id = EventInstanceId::from(event_id);

    let parsed = state.events(&calendar_slug).map_err(|e| e.to_string())?;
    Ok(parsed
        .iter()
        .find(|e| e.event_instance_id() == id)
        .map(|event| to_calendar_event(event, &calendar_slug, &parsed)))
}
