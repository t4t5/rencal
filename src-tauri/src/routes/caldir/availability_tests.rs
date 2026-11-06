use super::types::{CalendarEvent, CreateEventInput, EventAvailability, UpdateEventInput};
use super::{create_event, create_local_calendar, get_event, update_event};
use crate::state::{AppState, ProviderDirs};
use serde_json::{Value, json};

struct Fixture {
    _dir: tempfile::TempDir,
    state: AppState,
    slug: String,
}

impl Fixture {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("data");
        std::fs::create_dir(&data).unwrap();
        let config = dir.path().join("config.toml");
        std::fs::write(&config, format!("calendar_dir = {data:?}\n")).unwrap();
        let state = AppState::load_from(config, ProviderDirs::default()).unwrap();
        let calendar =
            create_local_calendar::handler(&state, "Availability test".into(), None).unwrap();
        Self {
            _dir: dir,
            state,
            slug: calendar.slug,
        }
    }

    fn input(&self) -> Value {
        json!({
            "calendar_slug": self.slug,
            "summary": "Availability test",
            "description": null, "location": null, "url": null,
            "start": {"kind": "date", "date": "2026-11-03"},
            "end": {"kind": "date", "date": "2026-11-04"},
            "recurrence": null, "reminders": [], "attendees": [],
            "conference": null, "color": null
        })
    }

    fn stored(&self, id: &str, slug: &str) -> CalendarEvent {
        get_event::handler(&self.state, slug.into(), id.into())
            .unwrap()
            .unwrap()
    }

    fn update(
        &self,
        event: &CalendarEvent,
        availability: Option<EventAvailability>,
    ) -> UpdateEventInput {
        let mut value = self.input();
        value["id"] = json!(event.id);
        value["new_calendar_slug"] = Value::Null;
        if let Some(availability) = availability {
            value["availability"] = json!(availability);
        }
        serde_json::from_value(value).unwrap()
    }
}

#[test]
fn creates_busy_by_default_and_round_trips_both_availability_values() {
    let f = Fixture::new();
    let input: CreateEventInput = serde_json::from_value(f.input()).unwrap();
    let event = create_event::handler(&f.state, input).unwrap();
    assert_eq!(
        f.stored(&event.id, &f.slug).availability,
        EventAvailability::Busy
    );

    for availability in [EventAvailability::Free, EventAvailability::Busy] {
        let mut input = f.input();
        input["availability"] = json!(availability);
        let event =
            create_event::handler(&f.state, serde_json::from_value(input).unwrap()).unwrap();
        assert_eq!(f.stored(&event.id, &f.slug).availability, availability);
    }
}

#[test]
fn toggles_availability_on_stored_events_and_preserves_it_for_older_clients() {
    let f = Fixture::new();
    let event =
        create_event::handler(&f.state, serde_json::from_value(f.input()).unwrap()).unwrap();
    for availability in [
        EventAvailability::Free,
        EventAvailability::Busy,
        EventAvailability::Free,
    ] {
        update_event::handler(&f.state, f.update(&event, Some(availability))).unwrap();
        assert_eq!(f.stored(&event.id, &f.slug).availability, availability);
    }
    // A legacy client's title-only edit must not silently reset a free event to busy.
    let mut input = f.update(&event, None);
    input.summary = "Updated title".into();
    update_event::handler(&f.state, input).unwrap();
    let stored = f.stored(&event.id, &f.slug);
    assert_eq!(stored.availability, EventAvailability::Free);
    assert_eq!(stored.summary, "Updated title");
}

#[test]
fn preserves_free_status_when_moving_to_another_calendar() {
    let f = Fixture::new();
    let target = create_local_calendar::handler(&f.state, "Target".into(), None).unwrap();
    let event =
        create_event::handler(&f.state, serde_json::from_value(f.input()).unwrap()).unwrap();
    let mut input = f.update(&event, Some(EventAvailability::Free));
    input.new_calendar_slug = Some(target.slug.clone());
    update_event::handler(&f.state, input).unwrap();
    let stored = f.state.events(&target.slug).unwrap();
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].availability, caldir_core::Availability::Free);
}

#[test]
fn recurring_instance_overrides_save_availability_without_changing_the_master() {
    let f = Fixture::new();
    let mut input = f.input();
    input["recurrence"] = json!({"rrule": "FREQ=DAILY;COUNT=3", "exdates": [], "rdates": []});
    let master = create_event::handler(&f.state, serde_json::from_value(input).unwrap()).unwrap();
    let occurrences = super::list_events::handler(
        &f.state,
        vec![f.slug.clone()],
        "2026-11-03T00:00:00Z".into(),
        "2026-11-07T00:00:00Z".into(),
    )
    .unwrap();
    let occurrence = occurrences
        .iter()
        .find(|event| event.recurring_event_id.is_some())
        .unwrap();
    let mut input = f.update(occurrence, Some(EventAvailability::Free));
    input.start = occurrence.start.clone();
    input.end = occurrence.end.clone();
    update_event::handler(&f.state, input).unwrap();
    let stored = f.stored(&occurrence.id, &f.slug);
    assert_eq!(stored.availability, EventAvailability::Free);
    assert_eq!(
        f.stored(&master.id, &f.slug).availability,
        EventAvailability::Busy
    );
}

#[test]
fn rejects_availability_outside_busy_or_free() {
    let f = Fixture::new();
    let mut input = f.input();
    input["availability"] = json!("maybe");
    assert!(serde_json::from_value::<CreateEventInput>(input).is_err());
}
