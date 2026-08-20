use super::helpers::{is_visible, load_caldir};
use super::types::{CalendarEvent, core_recurrence_to_rpc};
use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use caldir_core::{Event, EventInstanceId, EventUid, expand_in_range};
use chrono::{DateTime, Duration, Utc};
use std::sync::Arc;

pub(super) async fn handler(
    uid: String,
    recurrence_id: Option<String>,
) -> TauResult<Option<CalendarEvent>> {
    if uid.is_empty() {
        return Ok(None);
    }

    let Some(target) = LookupTarget::new(uid, recurrence_id) else {
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

struct LookupTarget {
    id: EventInstanceId,
    recurrence_time: Option<DateTime<Utc>>,
}

impl LookupTarget {
    fn new(uid: String, recurrence_id: Option<String>) -> Option<Self> {
        match recurrence_id {
            None => Some(Self {
                // Do not parse an opaque UID: it may itself end in `__<date>`.
                id: EventInstanceId::new(EventUid::new(uid), None),
                recurrence_time: None,
            }),
            Some(recurrence_id) if !recurrence_id.is_empty() => {
                let id = EventInstanceId::from(format!("{uid}__{recurrence_id}"));
                if id.uid().as_str() != uid || id.recurrence_id().is_none() {
                    return None;
                }
                let recurrence_time = id.recurrence_id()?.as_event_time().to_utc();
                Some(Self {
                    id,
                    recurrence_time: Some(recurrence_time),
                })
            }
            Some(_) => None,
        }
    }
}

fn find_in_sources<I>(target: &LookupTarget, sources: I) -> TauResult<Option<CalendarEvent>>
where
    I: IntoIterator<Item = TauResult<(String, Arc<Vec<Event>>)>>,
{
    for source in sources {
        let (slug, parsed) = source?;

        let matched = if let Some(recurrence_time) = target.recurrence_time {
            let Some(from) = recurrence_time.checked_sub_signed(Duration::days(1)) else {
                return Ok(None);
            };
            let Some(to) = recurrence_time.checked_add_signed(Duration::days(1)) else {
                return Ok(None);
            };
            expand_in_range(parsed.iter().cloned(), from, to)
                .into_iter()
                .find(|event| event.event_instance_id() == target.id && is_visible(event))
        } else {
            parsed
                .iter()
                .find(|event| event.event_instance_id() == target.id && is_visible(event))
                .cloned()
        };

        if let Some(event) = matched {
            let master_recurrence = event.recurrence_id.as_ref().and_then(|_| {
                parsed
                    .iter()
                    .find(|candidate| {
                        candidate.uid.as_str() == event.uid.as_str()
                            && candidate.recurrence.is_some()
                    })
                    .and_then(|master| master.recurrence.as_ref().map(core_recurrence_to_rpc))
            });
            return Ok(Some(CalendarEvent::from_event(
                &event,
                &slug,
                master_recurrence,
            )));
        }
    }

    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use caldir_core::{EventTime, Recurrence, RecurrenceId, Status};
    use chrono::TimeZone;

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
        let target = LookupTarget::new(uid.into(), recurrence_id.map(String::from)).unwrap();
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
        let target = LookupTarget::new(uid.into(), None).unwrap();
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
        let master_target = LookupTarget::new("series".into(), None).unwrap();
        assert_eq!(
            find_in_sources(&master_target, [source("calendar", vec![master.clone()])])
                .unwrap()
                .unwrap()
                .summary,
            "master"
        );

        let occurrence_target =
            LookupTarget::new("series".into(), Some("20260826T090000Z".into())).unwrap();
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

        let target = LookupTarget::new("series".into(), Some("20260826T090000Z".into())).unwrap();
        let found = find_in_sources(&target, [source("calendar", vec![master, moved])])
            .unwrap()
            .unwrap();
        assert_eq!(found.summary, "moved");
        assert_eq!(found.id, "series__20260826T090000Z");
    }

    #[test]
    fn excluded_cancelled_and_missing_occurrences_are_absent() {
        let mut excluded_master = recurring("excluded");
        excluded_master
            .recurrence
            .as_mut()
            .unwrap()
            .exdates
            .push(time(26, 9));
        let excluded =
            LookupTarget::new("excluded".into(), Some("20260826T090000Z".into())).unwrap();
        assert!(
            find_in_sources(&excluded, [source("calendar", vec![excluded_master])])
                .unwrap()
                .is_none()
        );

        let master = recurring("cancelled");
        let mut cancelled = event("cancelled", "cancelled", 26);
        cancelled.recurrence_id = Some(RecurrenceId::from_event_time(time(26, 9)));
        cancelled.status = Status::Cancelled;
        let target =
            LookupTarget::new("cancelled".into(), Some("20260826T090000Z".into())).unwrap();
        assert!(
            find_in_sources(&target, [source("calendar", vec![master, cancelled])])
                .unwrap()
                .is_none()
        );

        let missing = LookupTarget::new("missing".into(), Some("20260826T090000Z".into())).unwrap();
        assert!(
            find_in_sources(&missing, [source("calendar", vec![])])
                .unwrap()
                .is_none()
        );
        assert!(LookupTarget::new("series".into(), Some("invalid".into())).is_none());
    }

    #[test]
    fn duplicate_returns_first_source_without_reading_the_next() {
        let target = LookupTarget::new("same".into(), None).unwrap();
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
