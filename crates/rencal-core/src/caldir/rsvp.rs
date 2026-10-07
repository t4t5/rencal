use super::types::ResponseStatus;
use crate::error::CoreResult;
use crate::error::{CoreError, CoreErrorKind};
use crate::state::AppState;
use caldir_core::EventInstanceId;

pub fn rsvp(
    state: &AppState,
    calendar_slug: String,
    event_id: String,
    response: ResponseStatus,
) -> CoreResult<()> {
    let calendar = state.caldir().calendar(&calendar_slug)?;

    let user_email = calendar
        .remote_email()
        .ok_or_else(|| {
            CoreError::new(
                CoreErrorKind::Configuration,
                "Calendar has no account email",
            )
        })?
        .to_string();

    let instance_id = EventInstanceId::from(event_id.as_str());
    let status = response.into();

    // Is recurring instance:
    if instance_id.recurrence_id().is_some() {
        let mut result = Ok(());

        calendar.update_recurring_instance(&instance_id, |event| {
            result = event.set_attendee_status(&user_email, status);
        })?;

        result?;
    } else {
        let mut cal_event = calendar
            .event_by_instance_id(&instance_id)?
            .ok_or_else(|| {
                CoreError::new(
                    CoreErrorKind::EventNotFound,
                    format!("Event not found: {}", event_id),
                )
            })?;

        cal_event.update_attendee_status(&user_email, status)?;
    }

    state.invalidate_events(&calendar_slug);

    Ok(())
}
