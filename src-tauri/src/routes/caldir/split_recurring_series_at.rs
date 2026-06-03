use super::helpers::load_caldir;
use super::types::{
    CalendarEvent, SplitRecurringSeriesInput, rpc_recurrence_to_core, rpc_time_to_core,
};
use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use caldir_core::EventUid;

pub(super) async fn handler(input: SplitRecurringSeriesInput) -> TauResult<CalendarEvent> {
    let caldir = load_caldir()?;
    let calendar = caldir
        .calendar(&input.calendar_slug)
        .map_err(|e| e.to_string())?;

    let split_start = rpc_time_to_core(&input.split_start)?;
    let split_end = rpc_time_to_core(&input.split_end)?;
    let new_recurrence = input
        .new_recurrence
        .as_ref()
        .map(rpc_recurrence_to_core)
        .transpose()?;

    let new_master = calendar
        .split_recurring_series_at(
            &EventUid::new(input.master_uid.as_str()),
            split_start,
            split_end,
            new_recurrence,
        )
        .map_err(|e| e.to_string())?;
    EVENT_CACHE.invalidate(&input.calendar_slug);

    Ok(CalendarEvent::from_event(
        &new_master,
        &input.calendar_slug,
        None,
    ))
}
