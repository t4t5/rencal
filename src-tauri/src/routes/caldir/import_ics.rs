use super::helpers::load_caldir;
use super::types::{ImportEventEdit, rpc_recurrence_to_core, rpc_time_to_core};
use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use caldir_core::{Calendar, Event, Reminder};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

pub(super) async fn handler(
    path: String,
    calendar_slug: String,
    edits: Vec<ImportEventEdit>,
) -> TauResult<u32> {
    let contents =
        std::fs::read_to_string(&path).map_err(|e| format!("Could not read '{path}': {e}"))?;
    let mut events = parse_import_events(&contents, &path)?;

    apply_edits(&mut events, edits)?;

    let caldir = load_caldir()?;
    let calendar = caldir.calendar(&calendar_slug).map_err(|e| e.to_string())?;
    let created = import_events_into_calendar(&calendar, events)?;

    EVENT_CACHE.invalidate(&calendar_slug);

    Ok(created)
}

fn parse_import_events(contents: &str, path: &str) -> TauResult<Vec<Event>> {
    let parsed = Event::from_ics_str(contents).map_err(|e| e.to_string())?;
    let mut events = Vec::new();

    for result in parsed {
        match result {
            Ok(event) => events.push(event),
            Err(e) => log::warn!("skipping unparseable event in '{path}': {e}"),
        }
    }

    if events.is_empty() {
        return Err(format!("No events found in '{path}'"));
    }

    Ok(events)
}

fn apply_edits(events: &mut [Event], edits: Vec<ImportEventEdit>) -> TauResult<()> {
    let edit_by_id: HashMap<String, ImportEventEdit> = edits
        .into_iter()
        .map(|edit| (edit.id.clone(), edit))
        .collect();

    for event in events.iter_mut() {
        if event.recurrence_id.is_some() {
            continue;
        }

        let event_id = event.event_instance_id().to_string();
        let Some(edit) = edit_by_id.get(&event_id) else {
            continue;
        };

        event.summary = Some(edit.summary.clone());
        event.description = edit.description.clone();
        event.location = edit.location.clone();
        event.start = rpc_time_to_core(&edit.start)?;
        event.end = Some(rpc_time_to_core(&edit.end)?);
        event.recurrence = edit
            .recurrence
            .as_ref()
            .map(rpc_recurrence_to_core)
            .transpose()?;
        event.reminders = edit
            .reminders
            .iter()
            .map(|&m| Reminder {
                minutes_before_start: m as i64,
            })
            .collect();
        event.attendees = edit.attendees.iter().map(|a| a.to_core()).collect();
    }

    Ok(())
}

fn import_events_into_calendar(calendar: &Calendar, events: Vec<Event>) -> TauResult<u32> {
    import_events_into_calendar_inner(calendar, events, None)
}

fn import_events_into_calendar_inner(
    calendar: &Calendar,
    events: Vec<Event>,
    #[cfg_attr(not(test), allow(unused_variables))] fail_after_creates: Option<usize>,
) -> TauResult<u32> {
    let existing_uids: HashSet<String> = calendar
        .events()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|ce| ce.event().uid.as_str().to_string())
        .collect();

    let mut colliding_uids = HashSet::new();
    for event in &events {
        if existing_uids.contains(event.uid.as_str()) {
            colliding_uids.insert(event.uid.as_str().to_string());
        }
    }

    for uid in &colliding_uids {
        log::warn!("skipping imported event with existing UID '{uid}'");
    }

    let (mut masters, mut overrides): (Vec<Event>, Vec<Event>) = events
        .into_iter()
        .filter(|event| !colliding_uids.contains(event.uid.as_str()))
        .partition(|event| event.recurrence_id.is_none());
    masters.append(&mut overrides);

    let mut created_paths: Vec<PathBuf> = Vec::new();

    for event in masters {
        if let Some(limit) = fail_after_creates
            && created_paths.len() >= limit
        {
            rollback_created_files(created_paths);
            return Err("simulated import failure".to_string());
        }

        match calendar.create_event(event) {
            Ok(created) => created_paths.push(created.path().to_path_buf()),
            Err(e) => {
                rollback_created_files(created_paths);
                return Err(e.to_string());
            }
        }
    }

    Ok(created_paths.len() as u32)
}

fn rollback_created_files(paths: Vec<PathBuf>) {
    for path in paths {
        if let Err(err) = std::fs::remove_file(&path) {
            log::warn!(
                "failed to roll back imported event '{}': {err}",
                path.display()
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use caldir_core::{Calendar, Event, EventTime, EventUid, Recurrence, RecurrenceId, XProperty};
    use chrono::NaiveDate;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_calendar() -> (PathBuf, Calendar) {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("rencal-import-ics-test-{nanos}"));
        let calendar = Calendar::create(&path, None).unwrap();
        (path, calendar)
    }

    fn date(day: u32) -> EventTime {
        EventTime::Date(NaiveDate::from_ymd_opt(2026, 7, day).unwrap())
    }

    fn import_fixture() -> Vec<Event> {
        let mut master = Event::new("Original", date(1));
        master.uid = EventUid::new("series@example.com");
        master.end = Some(date(2));
        master.recurrence = Some(Recurrence {
            rrule: "FREQ=DAILY;COUNT=3".to_string(),
            exdates: Vec::new(),
            rdates: Vec::new(),
        });
        master.x_properties.push(XProperty::new(
            "X-GOOGLE-CONFERENCE",
            "https://meet.example.com/abc",
        ));

        let mut override_event = Event::new("Moved", date(3));
        override_event.uid = EventUid::new("series@example.com");
        override_event.end = Some(date(4));
        override_event.recurrence_id = Some(RecurrenceId::from_event_time(date(2)));

        vec![master, override_event]
    }

    #[test]
    fn applies_master_edits_and_preserves_override_metadata() {
        let (path, calendar) = temp_calendar();
        let mut events = import_fixture();
        let id = events[0].event_instance_id().to_string();

        apply_edits(
            &mut events,
            vec![ImportEventEdit {
                id,
                summary: "Edited".to_string(),
                description: Some("Notes".to_string()),
                location: Some("Room".to_string()),
                start: super::super::types::core_time_to_rpc(&date(10)),
                end: super::super::types::core_time_to_rpc(&date(11)),
                recurrence: Some(super::super::types::RpcRecurrence {
                    rrule: "FREQ=WEEKLY;COUNT=2".to_string(),
                    exdates: Vec::new(),
                }),
                reminders: vec![10],
                attendees: Vec::new(),
            }],
        )
        .unwrap();

        let created = import_events_into_calendar(&calendar, events).unwrap();
        assert_eq!(created, 2);

        let saved = calendar.events().unwrap();
        assert_eq!(saved.len(), 2);
        assert!(saved.iter().any(|ce| ce.event().recurrence_id.is_some()));
        let master = saved
            .iter()
            .find(|ce| ce.event().recurrence_id.is_none())
            .unwrap()
            .event();
        assert_eq!(master.summary.as_deref(), Some("Edited"));
        assert_eq!(
            master.x_property("X-GOOGLE-CONFERENCE"),
            Some("https://meet.example.com/abc")
        );

        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn skips_uid_collisions() {
        let (path, calendar) = temp_calendar();
        calendar.create_event(import_fixture().remove(0)).unwrap();

        let created = import_events_into_calendar(&calendar, import_fixture()).unwrap();
        assert_eq!(created, 0);
        assert_eq!(calendar.events().unwrap().len(), 1);

        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn rolls_back_files_on_partial_failure() {
        let (path, calendar) = temp_calendar();

        let err =
            import_events_into_calendar_inner(&calendar, import_fixture(), Some(1)).unwrap_err();
        assert_eq!(err, "simulated import failure");
        assert!(calendar.events().unwrap().is_empty());

        std::fs::remove_dir_all(path).unwrap();
    }
}
