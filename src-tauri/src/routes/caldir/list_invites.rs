use super::helpers::event_time_sort_key;
use super::types::CalendarEvent;
use crate::routes::TauResult;
use caldir_core::Caldir;
use chrono::Utc;

pub(super) async fn handler(calendar_slugs: Vec<String>) -> TauResult<Vec<CalendarEvent>> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let now = Utc::now();
    let mut invites = Vec::new();

    for slug in &calendar_slugs {
        let calendar = caldir.calendar(slug).map_err(|e| e.to_string())?;

        let email = match calendar.remote_email() {
            Some(e) => e.to_string(),
            None => continue,
        };

        for ce in calendar.events().map_err(|e| e.to_string())? {
            let event = ce.event();
            let is_future = event
                .end
                .as_ref()
                .map(|e| e.to_utc())
                .unwrap_or_else(|| event.start.to_utc())
                >= now;
            if event.is_pending_invite_for(&email) && is_future {
                invites.push(CalendarEvent::from_event(event, slug, None));
            }
        }
    }

    invites.sort_by_key(|a| event_time_sort_key(&a.start));
    Ok(invites)
}
