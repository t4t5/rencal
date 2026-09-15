use crate::routes::TauResult;
use crate::state::AppState;
use caldir_core::EventInstanceId;

pub(super) fn handler(state: &AppState, calendar_slug: String, event_id: String) -> TauResult<()> {
    let calendar = state
        .caldir()
        .calendar(&calendar_slug)
        .map_err(|e| e.to_string())?;

    let instance_id = EventInstanceId::from(event_id.as_str());

    if instance_id.recurrence_id().is_some() {
        // Recurring event -> delete just this instance
        calendar
            .delete_recurring_instance(&instance_id)
            .map_err(|e| e.to_string())?;
    } else {
        // Non-recurring event -> delete its file directly.
        calendar
            .event_by_instance_id(&instance_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Event not found: {}", event_id))?
            .delete()
            .map_err(|e| e.to_string())?;
    }

    state.events.invalidate(&calendar_slug);

    Ok(())
}
