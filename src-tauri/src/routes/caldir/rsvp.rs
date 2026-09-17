use crate::routes::TauResult;
use crate::state::AppState;
use caldir_core::{EventInstanceId, ParticipationStatus};

pub(super) fn handler(
    state: &AppState,
    calendar_slug: String,
    event_id: String,
    response: String,
) -> TauResult<()> {
    let calendar = state
        .caldir()
        .calendar(&calendar_slug)
        .map_err(|e| e.to_string())?;

    let user_email = calendar
        .remote_email()
        .ok_or_else(|| "Calendar has no account email".to_string())?
        .to_string();

    let instance_id = EventInstanceId::from(event_id.as_str());
    let status = parse_participation_status(&response)?;

    // Is recurring instance:
    if instance_id.recurrence_id().is_some() {
        let mut result = Ok(());

        calendar
            .update_recurring_instance(&instance_id, |event| {
                result = event.set_attendee_status(&user_email, status);
            })
            .map_err(|e| e.to_string())?;

        result.map_err(|e| e.to_string())?;
    } else {
        let mut cal_event = calendar
            .event_by_instance_id(&instance_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Event not found: {}", event_id))?;

        cal_event
            .update_attendee_status(&user_email, status)
            .map_err(|e| e.to_string())?;
    }

    state.invalidate_events(&calendar_slug);

    Ok(())
}

fn parse_participation_status(s: &str) -> Result<ParticipationStatus, String> {
    match s {
        "accepted" => Ok(ParticipationStatus::Accepted),
        "declined" => Ok(ParticipationStatus::Declined),
        "tentative" => Ok(ParticipationStatus::Tentative),
        "needs-action" => Ok(ParticipationStatus::NeedsAction),
        other => Err(format!("Unknown participation status: {}", other)),
    }
}
