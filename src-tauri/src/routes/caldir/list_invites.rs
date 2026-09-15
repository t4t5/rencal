use super::helpers::{event_time_sort_key, is_visible};
use super::types::CalendarEvent;
use crate::routes::TauResult;
use crate::state::AppState;

pub(super) fn handler(
    state: &AppState,
    calendar_slugs: Vec<String>,
) -> TauResult<Vec<CalendarEvent>> {
    let mut invites = Vec::new();

    for slug in &calendar_slugs {
        let calendar = state.caldir().calendar(slug).map_err(|e| e.to_string())?;

        let email = match calendar.remote_email() {
            Some(e) => e.to_string(),
            None => continue,
        };

        let parsed = state.events(slug).map_err(|e| e.to_string())?;
        for event in parsed.iter() {
            if !is_visible(event) {
                continue;
            }
            if event.is_pending_invite_for(&email) {
                invites.push(CalendarEvent::from_event(event, slug, None));
            }
        }
    }

    invites.sort_by_key(|a| event_time_sort_key(&a.start));
    Ok(invites)
}
