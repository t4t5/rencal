use crate::event_cache::EVENT_CACHE;
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

    let id = EventInstanceId::from(event_id.as_str());
    let mut cal_event = calendar
        .event_by_instance_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Event not found: {}", event_id))?;

    let status = parse_participation_status(&response)?;

    cal_event
        .update_attendee_status(&email, status)
        .map_err(|e| e.to_string())?;
    EVENT_CACHE.invalidate(&calendar_slug);
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
