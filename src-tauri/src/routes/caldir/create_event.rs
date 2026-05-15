use super::types::{
    CalendarEvent, CreateEventInput, rpc_recurrence_to_core, rpc_time_to_core,
};
use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use caldir_core::{Caldir, Event, Reminder};

pub(super) async fn handler(input: CreateEventInput) -> TauResult<CalendarEvent> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let calendar = caldir
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
    event.set_end(end);
    if let Some(d) = input.description {
        event.set_description(d);
    }
    if let Some(l) = input.location {
        event.set_location(l);
    }
    if let Some(rec) = recurrence {
        event.set_recurrence(rec);
    }
    event.set_reminders(reminders);

    let cal_event = calendar.create_event(event).map_err(|e| e.to_string())?;
    EVENT_CACHE.invalidate(&input.calendar_slug);

    Ok(CalendarEvent::from_event(
        cal_event.event(),
        &input.calendar_slug,
        None,
    ))
}
