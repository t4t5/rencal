use crate::routes::TauResult;
use caldir_core::Caldir;

pub(super) async fn handler(calendar_slug: String, uid: String) -> TauResult<()> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let calendar = caldir.calendar(&calendar_slug).map_err(|e| e.to_string())?;

    // Find all events with this uid (parent + instances)
    let events_to_delete: Vec<_> = calendar
        .events()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|ce| ce.event().uid.as_str() == uid)
        .collect();

    for ce in events_to_delete {
        ce.delete().map_err(|e| e.to_string())?;
    }
    Ok(())
}
