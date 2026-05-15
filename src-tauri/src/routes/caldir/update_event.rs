use super::types::{UpdateEventInput, rpc_recurrence_to_core, rpc_time_to_core};
use crate::routes::TauResult;
use caldir_core::{Caldir, Event, EventInstanceId, Reminder};
use chrono::Utc;

pub(super) async fn handler(input: UpdateEventInput) -> TauResult<()> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let calendar = caldir
        .calendar(&input.calendar_slug)
        .map_err(|e| e.to_string())?;

    let id: EventInstanceId = input.id.parse().map_err(|e: String| e)?;
    let mut existing_ce = calendar
        .event_by_instance_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Event not found: {}", input.id))?;
    let existing = existing_ce.event().clone();

    let start = rpc_time_to_core(&input.start)?;
    let end = rpc_time_to_core(&input.end)?;
    let recurrence = input
        .recurrence
        .as_ref()
        .map(rpc_recurrence_to_core)
        .transpose()?;
    let reminders: Vec<Reminder> = input
        .reminders
        .iter()
        .map(|&m| Reminder {
            minutes_before_start: m as i64,
        })
        .collect();

    let updated_event = Event {
        uid: existing.uid.clone(),
        summary: Some(input.summary),
        description: input.description,
        location: input.location,
        start,
        end: Some(end),
        status: existing.status,
        availability: existing.availability,
        visibility: existing.visibility,
        recurrence,
        recurrence_id: existing.recurrence_id.clone(),
        reminders,
        organizer: existing.organizer.clone(),
        attendees: existing.attendees.clone(),
        url: existing.url.clone(),
        x_properties: existing.x_properties.clone(),
        last_modified: Some(Utc::now()),
        sequence: existing.sequence + 1,
    };

    let moving = input
        .new_calendar_slug
        .as_ref()
        .is_some_and(|new_slug| new_slug != &input.calendar_slug);

    if moving && existing.recurrence_id.is_some() {
        return Err("Cannot move a recurring instance to another calendar; \
             move the whole series instead"
            .to_string());
    }

    if moving {
        let target_calendar = caldir
            .calendar(input.new_calendar_slug.as_ref().unwrap())
            .map_err(|e| e.to_string())?;

        // New UID so remote providers treat it as a fresh event
        let moved_event = updated_event.with_new_uid();

        // Create in target calendar first (safe: if this fails, original is untouched)
        target_calendar
            .create_event(moved_event)
            .map_err(|e| e.to_string())?;

        // Only delete from source after successful creation
        existing_ce.delete().map_err(|e| e.to_string())?;
    } else {
        existing_ce
            .update(updated_event)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
