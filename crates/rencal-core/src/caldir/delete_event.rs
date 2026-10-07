use crate::error::CoreResult;
use crate::error::{CoreError, CoreErrorKind};
use crate::state::AppState;
use caldir_core::EventInstanceId;

pub fn delete_event(state: &AppState, calendar_slug: String, event_id: String) -> CoreResult<()> {
    let calendar = state.caldir().calendar(&calendar_slug)?;

    let instance_id = EventInstanceId::from(event_id.as_str());

    if instance_id.recurrence_id().is_some() {
        // Recurring event -> delete just this instance
        calendar.delete_recurring_instance(&instance_id)?;
    } else {
        // Non-recurring event -> delete its file directly.
        calendar
            .event_by_instance_id(&instance_id)?
            .ok_or_else(|| {
                CoreError::new(
                    CoreErrorKind::EventNotFound,
                    format!("Event not found: {}", event_id),
                )
            })?
            .delete()?;
    }

    state.invalidate_events(&calendar_slug);

    Ok(())
}
