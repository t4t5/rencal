use super::types::{UpdateEventInput, rpc_recurrence_to_core, rpc_time_to_core};
use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use caldir_core::{Caldir, EventInstanceId, Reminder};
use chrono::Utc;

pub(super) async fn handler(input: UpdateEventInput) -> TauResult<()> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;

    let calendar = caldir
        .calendar(&input.calendar_slug)
        .map_err(|e| e.to_string())?;

    let id = EventInstanceId::from(input.id.as_str());

    let mut existing_calendar_event = calendar
        .event_by_instance_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Event not found: {}", input.id))?;

    let mut updated_event = existing_calendar_event.event().clone();

    let input_recurrence = input
        .recurrence
        .as_ref()
        .map(rpc_recurrence_to_core)
        .transpose()?;

    let input_reminders: Vec<Reminder> = input
        .reminders
        .iter()
        .map(|&m| Reminder {
            minutes_before_start: m as i64,
        })
        .collect();

    updated_event.summary = Some(input.summary);
    updated_event.description = input.description;
    updated_event.location = input.location;
    updated_event.start = rpc_time_to_core(&input.start)?;
    updated_event.end = Some(rpc_time_to_core(&input.end)?);
    updated_event.recurrence = input_recurrence;
    updated_event.reminders = input_reminders;
    updated_event.last_modified = Some(Utc::now());
    updated_event.sequence += 1;

    let moving = input
        .new_calendar_slug
        .as_ref()
        .is_some_and(|new_slug| new_slug != &input.calendar_slug);

    if moving && updated_event.recurrence_id.is_some() {
        return Err("Cannot move a recurring instance to another calendar; \
             move the whole series instead"
            .to_string());
    }

    if moving {
        let new_slug = input.new_calendar_slug.as_ref().unwrap();
        let target_calendar = caldir.calendar(new_slug).map_err(|e| e.to_string())?;

        // New UID so remote providers treat it as a fresh event
        let moved_event = updated_event.with_new_uid();

        // Create in target calendar first (safe: if this fails, original is untouched)
        target_calendar
            .create_event(moved_event)
            .map_err(|e| e.to_string())?;

        // Only delete from source after successful creation
        existing_calendar_event
            .delete()
            .map_err(|e| e.to_string())?;

        EVENT_CACHE.invalidate(&input.calendar_slug);
        EVENT_CACHE.invalidate(new_slug);
    } else {
        existing_calendar_event
            .update(updated_event)
            .map_err(|e| e.to_string())?;

        EVENT_CACHE.invalidate(&input.calendar_slug);
    }

    Ok(())
}
