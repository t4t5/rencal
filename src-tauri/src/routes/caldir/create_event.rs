use super::conference::apply_conference;
use super::types::{CalendarEvent, CreateEventInput, rpc_recurrence_to_core, rpc_time_to_core};
use crate::routes::TauResult;
use crate::state::AppState;
use caldir_core::{Event, Reminder};

pub(super) fn handler(state: &AppState, input: CreateEventInput) -> TauResult<CalendarEvent> {
    let calendar = state
        .caldir()
        .calendar(&input.calendar_slug)
        .map_err(|e| e.to_string())?;

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

    let mut event = Event::new(input.summary, start);
    event.end = Some(end);
    event.description = input.description;
    event.location = input.location;
    event.url = input.url;
    event.recurrence = recurrence;
    event.reminders = reminders;
    event.attendees = input.attendees.iter().map(|a| a.to_core()).collect();
    apply_conference(&mut event, &calendar, input.conference.as_ref());

    let cal_event = calendar.create_event(event).map_err(|e| e.to_string())?;
    state.events.invalidate(&input.calendar_slug);

    Ok(CalendarEvent::from_event(
        cal_event.event(),
        &input.calendar_slug,
        None,
    ))
}
