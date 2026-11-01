use super::ics_file::IcsFile;
use super::types::{CalendarEvent, IcsPreview, IcsSourceCalendar, core_time_to_rpc};
use crate::routes::TauResult;

/// What an .ics file holds, for the import dialog. Nothing is written.
pub(super) fn handler(path: String) -> TauResult<IcsPreview> {
    let file = IcsFile::read(&path)?;

    let calendars = file
        .calendars
        .iter()
        .map(|calendar| {
            // A source calendar is never empty.
            let start = &calendar.events[0].start;
            let (first, last) = calendar.events.iter().map(|event| &event.start).fold(
                (start, start),
                |(first, last), start| {
                    (
                        if start.to_utc() < first.to_utc() {
                            start
                        } else {
                            first
                        },
                        if start.to_utc() > last.to_utc() {
                            start
                        } else {
                            last
                        },
                    )
                },
            );
            IcsSourceCalendar {
                name: calendar.name.clone(),
                color: calendar.color.clone(),
                event_count: calendar.event_count() as u32,
                first_start: core_time_to_rpc(first),
                last_start: core_time_to_rpc(last),
                has_guests: calendar
                    .events
                    .iter()
                    .any(|event| event.organizer.is_some() || !event.attendees.is_empty()),
            }
        })
        .collect();

    Ok(IcsPreview {
        event: file
            .single_event()
            .map(|event| CalendarEvent::from_event(event, "", None)),
        file_name: file.file_name,
        calendars,
        skipped_count: file.skipped,
    })
}
