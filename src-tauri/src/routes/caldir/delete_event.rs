use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};
use crate::state::AppState;
use caldir_core::EventInstanceId;

pub(super) fn handler(state: &AppState, calendar_slug: String, event_id: String) -> TauResult<()> {
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
                RpcError::new(
                    RpcErrorKind::EventNotFound,
                    format!("Event not found: {}", event_id),
                )
            })?
            .delete()?;
    }

    state.invalidate_events(&calendar_slug);

    Ok(())
}
