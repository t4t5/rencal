use crate::routes::TauResult;
use caldir_core::{Caldir, EventInstanceId, ParticipationStatus};

pub(super) async fn handler(
    calendar_slug: String,
    event_id: String,
    response: String,
) -> TauResult<()> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let calendar = caldir.calendar(&calendar_slug).map_err(|e| e.to_string())?;

    let email = calendar
        .remote_email()
        .ok_or_else(|| "Calendar has no account email".to_string())?
        .to_string();

    let id: EventInstanceId = event_id.parse().map_err(|e: String| e)?;
    let mut cal_event = calendar
        .event_by_instance_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Event not found: {}", event_id))?;

    let status = parse_participation_status(&response)?;

    let updated_event = cal_event
        .event()
        .with_response(&email, status)
        .ok_or_else(|| "Failed to update response".to_string())?;

    cal_event
        .update(updated_event)
        .map_err(|e| e.to_string())?;
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
