use crate::routes::TauResult;
use caldir_core::{Caldir, EventInstanceId};

pub(super) async fn handler(calendar_slug: String, event_id: String) -> TauResult<()> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let calendar = caldir.calendar(&calendar_slug).map_err(|e| e.to_string())?;

    let id: EventInstanceId = event_id.parse().map_err(|e: String| e)?;
    let cal_event = calendar
        .event_by_instance_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Event not found: {}", event_id))?;
    cal_event.delete().map_err(|e| e.to_string())?;
    Ok(())
}
