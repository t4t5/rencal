use super::conference::apply_conference;
use super::types::{UpdateEventInput, rpc_recurrence_to_core, rpc_time_to_core};
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};
use crate::state::AppState;
use caldir_core::{Attendee, EventInstanceId, Reminder};
use chrono::Utc;

pub(super) fn handler(state: &AppState, input: UpdateEventInput) -> TauResult<()> {
    let calendar = state.caldir().calendar(&input.calendar_slug)?;

    let id = EventInstanceId::from(input.id.as_str());

    let start = rpc_time_to_core(&input.start)?;
    let end = rpc_time_to_core(&input.end)?;

    let input_reminders: Vec<Reminder> = input
        .reminders
        .iter()
        .map(|&m| Reminder {
            minutes_before_start: m as i64,
        })
        .collect();
    let input_attendees: Vec<Attendee> = input.attendees.iter().map(|a| a.to_core()).collect();

    let moving = input
        .new_calendar_slug
        .as_ref()
        .is_some_and(|new_slug| new_slug != &input.calendar_slug);

    // "Edit only this event" of a recurring series:
    if id.recurrence_id().is_some() {
        if moving {
            return Err(RpcError::new(
                RpcErrorKind::InvalidInput,
                "Cannot move a recurring instance to another calendar; \
                 move the whole series instead",
            ));
        }

        calendar.update_recurring_instance(&id, |event| {
            event.summary = Some(input.summary);
            event.description = input.description;
            event.location = input.location;
            event.url = input.url;
            event.start = start;
            event.end = Some(end);
            event.reminders = input_reminders;
            event.attendees = input_attendees;
            apply_conference(event, &calendar, input.conference.as_ref());
        })?;

        state.invalidate_events(&input.calendar_slug);

        Ok(())
    } else {
        let mut existing_calendar_event = calendar.event_by_instance_id(&id)?.ok_or_else(|| {
            RpcError::new(
                RpcErrorKind::EventNotFound,
                format!("Event not found: {}", input.id),
            )
        })?;

        let mut updated_event = existing_calendar_event.event().clone();

        let input_recurrence = input
            .recurrence
            .as_ref()
            .map(rpc_recurrence_to_core)
            .transpose()?;

        updated_event.summary = Some(input.summary);
        updated_event.description = input.description;
        updated_event.location = input.location;
        updated_event.url = input.url;
        updated_event.start = start;
        updated_event.end = Some(end);
        updated_event.recurrence = input_recurrence;
        updated_event.reminders = input_reminders;
        updated_event.attendees = input_attendees;
        updated_event.last_modified = Some(Utc::now());
        updated_event.sequence += 1;

        if moving {
            let new_slug = input.new_calendar_slug.as_ref().unwrap();
            let target_calendar = state.caldir().calendar(new_slug)?;
            apply_conference(
                &mut updated_event,
                &target_calendar,
                input.conference.as_ref(),
            );

            // New UID so remote providers treat it as a fresh event
            let moved_event = updated_event.with_new_uid();

            // Create in target calendar first (safe: if this fails, original is untouched)
            target_calendar.create_event(moved_event)?;

            // Only delete from source after successful creation
            existing_calendar_event.delete()?;

            state.invalidate_events(&input.calendar_slug);
            state.invalidate_events(new_slug);
        } else {
            apply_conference(&mut updated_event, &calendar, input.conference.as_ref());
            existing_calendar_event.update(updated_event)?;

            state.invalidate_events(&input.calendar_slug);
        }

        Ok(())
    }
}
