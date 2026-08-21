use super::helpers::{load_caldir, to_calendar_event};
use super::types::CalendarEvent;
use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use caldir_core::{Event, EventInstanceId, EventUid, expand_in_range};
use chrono::Duration;
use std::sync::Arc;

pub(super) async fn handler(
    uid: String,
    recurrence_id: Option<String>,
) -> TauResult<Option<CalendarEvent>> {
    if uid.is_empty() {
        return Ok(None);
    }

    let Some(target) = parse_lookup_target(uid, recurrence_id) else {
        return Ok(None);
    };
    let caldir = load_caldir()?;

    let sources = caldir.calendars().into_iter().map(|calendar| {
        let calendar = calendar.map_err(|error| error.to_string())?;
        let slug = calendar
            .slug()
            .ok_or_else(|| "calendar is missing a slug".to_string())?
            .to_string();
        let events = EVENT_CACHE.events(&caldir, &slug)?;
        Ok((slug, events))
    });

    find_in_sources(&target, sources)
}

fn parse_lookup_target(uid: String, recurrence_id: Option<String>) -> Option<EventInstanceId> {
    match recurrence_id {
        None => {
            // Do not parse an opaque UID: it may itself end in `__<date>`.
            Some(EventInstanceId::new(EventUid::new(uid), None))
        }
        Some(recurrence_id) if !recurrence_id.is_empty() => {
            let id = EventInstanceId::from(format!("{uid}__{recurrence_id}"));
            if id.uid().as_str() != uid || id.recurrence_id().is_none() {
                return None;
            }
            Some(id)
        }
        Some(_) => None,
    }
}

fn find_in_sources<I>(target: &EventInstanceId, sources: I) -> TauResult<Option<CalendarEvent>>
where
    I: IntoIterator<Item = TauResult<(String, Arc<Vec<Event>>)>>,
{
    // A recurrence target is matched by expanding a narrow window around its
    // recurrence time; the window depends only on the target, so compute it once.
    let window = match target.recurrence_id() {
        Some(recurrence_id) => {
            let recurrence_time = recurrence_id.as_event_time().to_utc();
            let (Some(from), Some(to)) = (
                recurrence_time.checked_sub_signed(Duration::days(1)),
                recurrence_time.checked_add_signed(Duration::days(1)),
            ) else {
                return Ok(None);
            };
            Some((from, to))
        }
        None => None,
    };

    for source in sources {
        let (slug, parsed) = source?;

        // Lookup is identity-based, not visibility-based: cancelled events are
        // hidden from calendar listings but remain valid deep-link targets.
        // Check stored events first because recurrence expansion intentionally
        // removes cancelled overrides.
        let matched = parsed
            .iter()
            .find(|event| event.event_instance_id().eq(target))
            .cloned()
            .or_else(|| {
                let (from, to) = window?;
                expand_in_range(parsed.iter().cloned(), from, to)
                    .into_iter()
                    .find(|event| event.event_instance_id().eq(target))
            });

        if let Some(event) = matched {
            return Ok(Some(to_calendar_event(&event, &slug, &parsed)));
        }
    }

    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use caldir_core::{EventTime, Recurrence, RecurrenceId, Status};
    use chrono::{TimeZone, Utc};

    fn time(day: u32, hour: u32) -> EventTime {
        EventTime::DateTimeUtc(Utc.with_ymd_and_hms(2026, 8, day, hour, 0, 0).unwrap())
    }

    fn event(uid: &str, summary: &str, day: u32) -> Event {
        let mut event = Event::new(summary, time(day, 9));
        event.uid = EventUid::new(uid);
        event.end = Some(time(day, 10));
        event
    }

    fn recurring(uid: &str) -> Event {
        let mut event = event(uid, "master", 25);
        event.recurrence = Some(Recurrence::new("FREQ=DAILY;COUNT=4"));
        event
    }

    fn source(slug: &str, events: Vec<Event>) -> TauResult<(String, Arc<Vec<Event>>)> {
        Ok((slug.into(), Arc::new(events)))
    }

    fn lookup(uid: &str, recurrence_id: Option<&str>) -> Option<CalendarEvent> {
        let target = parse_lookup_target(uid.into(), recurrence_id.map(String::from)).unwrap();
        find_in_sources(
            &target,
            [source("calendar", vec![event(uid, "single", 26)])],
        )
        .unwrap()
    }

    #[test]
    fn finds_non_recurring_event_and_opaque_uid() {
        assert_eq!(lookup("single", None).unwrap().summary, "single");

        let uid = "opaque__20260826";
        let target = parse_lookup_target(uid.into(), None).unwrap();
        let found = find_in_sources(
            &target,
            [source("calendar", vec![event(uid, "opaque", 26)])],
        )
        .unwrap()
        .unwrap();
        assert_eq!(found.summary, "opaque");
    }

    #[test]
    fn finds_recurring_master_and_generated_occurrence() {
        let master = recurring("series");
        let master_target = parse_lookup_target("series".into(), None).unwrap();
        assert_eq!(
            find_in_sources(&master_target, [source("calendar", vec![master.clone()])])
                .unwrap()
                .unwrap()
                .summary,
            "master"
        );

        let occurrence_target =
            parse_lookup_target("series".into(), Some("20260826T090000Z".into())).unwrap();
        let found = find_in_sources(&occurrence_target, [source("calendar", vec![master])])
            .unwrap()
            .unwrap();
        assert_eq!(found.id, "series__20260826T090000Z");
        assert!(found.master_recurrence.is_some());
    }

    #[test]
    fn finds_moved_override_by_original_recurrence_id() {
        let master = recurring("series");
        let mut moved = event("series", "moved", 30);
        moved.start = time(30, 15);
        moved.end = Some(time(30, 16));
        moved.recurrence_id = Some(RecurrenceId::from_event_time(time(26, 9)));

        let target = parse_lookup_target("series".into(), Some("20260826T090000Z".into())).unwrap();
        let found = find_in_sources(&target, [source("calendar", vec![master, moved])])
            .unwrap()
            .unwrap();
        assert_eq!(found.summary, "moved");
        assert_eq!(found.id, "series__20260826T090000Z");
    }

    #[test]
    fn finds_cancelled_events_and_recurring_overrides() {
        let mut single = event("single-cancelled", "cancelled single", 26);
        single.status = Status::Cancelled;
        let single_target = parse_lookup_target("single-cancelled".into(), None).unwrap();
        let found = find_in_sources(&single_target, [source("calendar", vec![single])])
            .unwrap()
            .unwrap();
        assert_eq!(found.summary, "cancelled single");
        assert_eq!(found.status, "cancelled");

        let master = recurring("cancelled");
        let mut cancelled = event("cancelled", "cancelled override", 26);
        cancelled.recurrence_id = Some(RecurrenceId::from_event_time(time(26, 9)));
        cancelled.status = Status::Cancelled;
        let target =
            parse_lookup_target("cancelled".into(), Some("20260826T090000Z".into())).unwrap();
        let found = find_in_sources(&target, [source("calendar", vec![master, cancelled])])
            .unwrap()
            .unwrap();
        assert_eq!(found.summary, "cancelled override");
        assert_eq!(found.status, "cancelled");
    }

    #[test]
    fn excluded_and_missing_occurrences_are_absent() {
        let mut excluded_master = recurring("excluded");
        excluded_master
            .recurrence
            .as_mut()
            .unwrap()
            .exdates
            .push(time(26, 9));
        let excluded =
            parse_lookup_target("excluded".into(), Some("20260826T090000Z".into())).unwrap();
        assert!(
            find_in_sources(&excluded, [source("calendar", vec![excluded_master])])
                .unwrap()
                .is_none()
        );

        let missing =
            parse_lookup_target("missing".into(), Some("20260826T090000Z".into())).unwrap();
        assert!(
            find_in_sources(&missing, [source("calendar", vec![])])
                .unwrap()
                .is_none()
        );
        assert!(parse_lookup_target("series".into(), Some("invalid".into())).is_none());
    }

    #[test]
    fn duplicate_returns_first_source_without_reading_the_next() {
        let target = parse_lookup_target("same".into(), None).unwrap();
        let mut first = Some(source("first", vec![event("same", "first", 26)]));
        let sources = std::iter::from_fn(move || {
            if first.is_some() {
                first.take()
            } else {
                panic!("source after the first match was inspected")
            }
        });

        let found = find_in_sources(&target, sources).unwrap().unwrap();
        assert_eq!(found.calendar_slug, "first");
        assert_eq!(found.summary, "first");
    }
}
