//! The `Backend` global: the shared `rencal_core::state::AppState`, plus the
//! caldir reads the views need, run off the main thread and converted to the
//! app's event model (`rencal_time`). This replaces the old `src/lib/api/`
//! facade: views never call `rencal_core::caldir` themselves; they go through
//! `EventStore` (and the few one-shot reads here).
//!
//! Writes (`create_event`, `update_event`, …) take app values and convert them
//! to the RPC inputs here, once; `editing::commands` owns the optimistic
//! updates and dialogs around them.
//!
//! Tests run without a backend (`Backend::try_state` is `None`), so the stores
//! stay empty instead of touching the user's caldir.

use std::sync::Arc;

use chrono::{NaiveDate, SecondsFormat, Utc};
use gpui_kit::{App, Global};
use rencal_core::caldir;
use rencal_core::error::{CoreError, CoreErrorKind, CoreResult};
use rencal_core::state::AppState;
use rencal_text::contacts::Contact;
use rencal_time::event::{DateRange, EventAttendee, EventConference, Recurrence, ResponseStatus};
use rencal_time::{Calendar, CalendarEvent, EventTime, EventTimeRange, Tz, zoned};
use serde::Serialize;
use serde::de::DeserializeOwned;
use tokio::task::JoinHandle;

use crate::runtime::Tokio;

pub struct Backend(Arc<AppState>);

impl Global for Backend {}

impl Backend {
    pub fn init(state: Arc<AppState>, cx: &mut App) {
        cx.set_global(Self(state));
    }

    /// The backend state, or `None` in tests.
    pub fn try_state(cx: &App) -> Option<Arc<AppState>> {
        cx.try_global::<Self>().map(|backend| backend.0.clone())
    }

    /// Runs `read` against the backend on the blocking pool. `None` without a
    /// backend.
    pub fn read<R>(
        cx: &App,
        read: impl FnOnce(&AppState) -> R + Send + 'static,
    ) -> Option<JoinHandle<R>>
    where
        R: Send + 'static,
    {
        let state = Self::try_state(cx)?;
        Some(Tokio::spawn_blocking(cx, move || read(&state)))
    }

    /// `read` for a write: a blocking caldir change on the blocking pool.
    pub fn write<R>(
        cx: &App,
        write: impl FnOnce(&AppState) -> R + Send + 'static,
    ) -> Option<JoinHandle<R>>
    where
        R: Send + 'static,
    {
        Self::read(cx, write)
    }

    /// Runs an async backend operation (sync, provider calls) on the runtime.
    pub fn run<F, R>(cx: &App, operation: impl FnOnce(Arc<AppState>) -> F) -> Option<JoinHandle<R>>
    where
        F: Future<Output = R> + Send + 'static,
        R: Send + 'static,
    {
        let state = Self::try_state(cx)?;
        Some(Tokio::handle(cx).spawn(operation(state)))
    }
}

/// Re-reads a backend (RPC-shaped) value as its app type. The app model in
/// `rencal_time` mirrors the RPC types field for field and parses them on
/// deserialisation, so serde is the conversion. `None` when the value doesn't
/// parse (an unknown time zone); the caller skips it, as `rpcToCalendarEvents`
/// did.
fn convert<T: DeserializeOwned>(value: &impl Serialize) -> Option<T> {
    let json = serde_json::to_value(value).ok()?;
    match serde_json::from_value(json) {
        Ok(value) => Some(value),
        Err(err) => {
            log::warn!("skipping a backend value the app can't read: {err}");
            None
        }
    }
}

pub fn app_events(events: &[caldir::CalendarEvent], viewer: Tz) -> Vec<CalendarEvent> {
    events
        .iter()
        .filter_map(convert::<CalendarEvent>)
        .map(|event| event.with_viewer(viewer))
        .collect()
}

pub fn app_calendars(calendars: &[caldir::Calendar]) -> Vec<Calendar> {
    calendars.iter().filter_map(convert).collect()
}

/// The UTC instant (RFC 3339) where viewer-zone `date` begins.
fn day_start_instant(date: NaiveDate, viewer: Tz) -> String {
    zoned::resolve_local(date.and_time(chrono::NaiveTime::MIN), viewer)
        .with_timezone(&Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Events of `slugs` overlapping viewer-zone days `[range.start, range.end)`.
pub fn list_events(
    state: &AppState,
    slugs: Vec<String>,
    range: DateRange,
    viewer: Tz,
) -> CoreResult<Vec<CalendarEvent>> {
    if slugs.is_empty() || range.start >= range.end {
        return Ok(Vec::new());
    }
    let events = caldir::list_events(
        state,
        slugs,
        day_start_instant(range.start, viewer),
        day_start_instant(range.end, viewer),
    )?;
    Ok(app_events(&events, viewer))
}

/// The editable fields every event write sends (TS `EventReplacement`).
/// Serialises to the RPC input's field names and shapes.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct EventFields {
    pub summary: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub url: Option<String>,
    pub start: EventTime,
    pub end: EventTime,
    pub recurrence: Option<Recurrence>,
    pub reminders: Vec<i32>,
    pub attendees: Vec<EventAttendee>,
    pub conference: Option<EventConference>,
}

impl EventFields {
    pub fn of(event: &CalendarEvent) -> Self {
        Self {
            summary: event.summary.clone(),
            description: event.description.clone(),
            location: event.location.clone(),
            url: event.url.clone(),
            start: event.start.clone(),
            end: event.end.clone(),
            recurrence: event.recurrence.clone(),
            reminders: event.reminders.clone(),
            attendees: event.attendees.clone(),
            conference: event.conference.clone(),
        }
    }
}

/// An app value as its RPC input type: the reverse of `convert`.
fn to_rpc<T: DeserializeOwned>(value: serde_json::Value) -> CoreResult<T> {
    serde_json::from_value(value)
        .map_err(|err| CoreError::new(CoreErrorKind::InvalidInput, err.to_string()))
}

fn fields_json(fields: &EventFields) -> serde_json::Map<String, serde_json::Value> {
    match serde_json::to_value(fields) {
        Ok(serde_json::Value::Object(map)) => map,
        _ => unreachable!("EventFields serialises to an object"),
    }
}

fn app_event(event: &caldir::CalendarEvent, viewer: Tz) -> CoreResult<CalendarEvent> {
    convert::<CalendarEvent>(event)
        .map(|event| event.with_viewer(viewer))
        .ok_or_else(|| CoreError::new(CoreErrorKind::Internal, "unreadable event"))
}

/// Creates an event and returns it as stored. A recurring create returns only
/// the master.
pub fn create_event(
    state: &AppState,
    calendar_slug: &str,
    fields: &EventFields,
    viewer: Tz,
) -> CoreResult<CalendarEvent> {
    let mut input = fields_json(fields);
    input.insert("calendar_slug".into(), calendar_slug.into());
    let created = caldir::create_event(state, to_rpc(input.into())?)?;
    app_event(&created, viewer)
}

/// Replaces an event's fields, moving it to `new_calendar_slug` when that is
/// set. A synthetic occurrence id becomes an override of its series.
pub fn update_event(
    state: &AppState,
    original: &EventKeyParts,
    new_calendar_slug: Option<String>,
    fields: &EventFields,
) -> CoreResult<()> {
    let mut input = fields_json(fields);
    input.insert("id".into(), original.id.clone().into());
    input.insert(
        "calendar_slug".into(),
        original.calendar_slug.clone().into(),
    );
    input.insert("new_calendar_slug".into(), new_calendar_slug.into());
    caldir::update_event(state, to_rpc(input.into())?)
}

/// An event's identity within its calendar.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EventKeyParts {
    pub calendar_slug: String,
    pub id: String,
}

impl EventKeyParts {
    pub fn of(event: &CalendarEvent) -> Self {
        Self {
            calendar_slug: event.calendar_slug.clone(),
            id: event.id.clone(),
        }
    }
}

pub fn delete_event(state: &AppState, event: &EventKeyParts) -> CoreResult<()> {
    caldir::delete_event(state, event.calendar_slug.clone(), event.id.clone())
}

pub fn delete_series(state: &AppState, calendar_slug: &str, uid: &str) -> CoreResult<()> {
    caldir::delete_recurring_series(state, calendar_slug.to_owned(), uid.to_owned())
}

/// Splits a series at one occurrence: the master's rule ends before `at`, and
/// a new master starting there carries `new_recurrence` (none for a single
/// event). Returns the new master.
pub fn split_series(
    state: &AppState,
    calendar_slug: &str,
    master_uid: &str,
    at: &EventTimeRange,
    new_recurrence: Option<&Recurrence>,
    viewer: Tz,
) -> CoreResult<CalendarEvent> {
    let input = serde_json::json!({
        "calendar_slug": calendar_slug,
        "master_uid": master_uid,
        "split_start": at.start,
        "split_end": at.end,
        "new_recurrence": new_recurrence,
    });
    let master = caldir::split_recurring_series_at(state, to_rpc(input)?)?;
    app_event(&master, viewer)
}

/// The stored event (a series master by its uid), or `None`.
pub fn get_event(
    state: &AppState,
    calendar_slug: &str,
    id: &str,
    viewer: Tz,
) -> CoreResult<Option<CalendarEvent>> {
    caldir::get_event(state, calendar_slug.to_owned(), id.to_owned())?
        .map(|event| app_event(&event, viewer))
        .transpose()
}

pub fn rsvp(state: &AppState, event: &EventKeyParts, response: ResponseStatus) -> CoreResult<()> {
    let response = to_rpc(serde_json::to_value(response).expect("a status serialises"))?;
    caldir::rsvp(
        state,
        event.calendar_slug.clone(),
        event.id.clone(),
        response,
    )
}

pub fn list_contacts(state: &AppState) -> CoreResult<Vec<Contact>> {
    Ok(caldir::list_contacts(state)?
        .iter()
        .filter_map(convert)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn day_starts_resolve_in_the_viewer_zone() {
        let date = NaiveDate::from_ymd_opt(2026, 3, 29).unwrap();
        assert_eq!(
            day_start_instant(date, chrono_tz::Europe::Stockholm),
            "2026-03-28T23:00:00.000Z"
        );
        assert_eq!(
            day_start_instant(date, chrono_tz::UTC),
            "2026-03-29T00:00:00.000Z"
        );
    }

    #[test]
    fn converts_rpc_events_and_skips_unknown_zones() {
        let rpc = |id: &str, tzid: &str| -> caldir::CalendarEvent {
            serde_json::from_value(serde_json::json!({
                "id": id,
                "recurring_event_id": null,
                "summary": "Standup",
                "description": null,
                "location": null,
                "url": null,
                "start": { "kind": "datetime_zoned", "wallclock": "2026-10-07T09:00:00", "tzid": tzid },
                "end": { "kind": "datetime_zoned", "wallclock": "2026-10-07T09:30:00", "tzid": tzid },
                "status": "confirmed",
                "recurrence": null,
                "master_recurrence": null,
                "reminders": [],
                "organizer": null,
                "attendees": [],
                "conference": null,
                "calendar_slug": "work",
                "color": null,
                "updated": null,
            }))
            .unwrap()
        };
        let events = app_events(
            &[rpc("a", "Europe/Stockholm"), rpc("b", "Mars/Olympus")],
            chrono_tz::UTC,
        );
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "a");
        // date_info is filled in for the viewer: 09:00 CEST is 07:00 UTC.
        assert_eq!(events[0].date_info.start_local_minutes, 7 * 60);
    }
}

#[cfg(test)]
mod write_tests {
    use std::path::Path;

    use rencal_core::state::{AppState, ProviderDirs};
    use rencal_time::EventTime;

    use super::*;

    fn calendar(data: &Path, slug: &str) {
        let path = data.join(slug);
        std::fs::create_dir_all(path.join(".caldir")).unwrap();
        std::fs::write(
            path.join(".caldir/config.toml"),
            format!("name = \"{slug}\"\n"),
        )
        .unwrap();
    }

    fn fields(summary: &str, start: &str, end: &str, recurrence: Option<&str>) -> EventFields {
        let zoned = |s: &str| {
            EventTime::zoned(
                chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M").unwrap(),
                chrono_tz::Europe::Stockholm,
            )
        };
        EventFields {
            summary: summary.into(),
            description: Some("Notes".into()),
            location: None,
            url: None,
            start: zoned(start),
            end: zoned(end),
            recurrence: recurrence.map(|rrule| Recurrence {
                rrule: rrule.into(),
                exdates: Vec::new(),
                rdates: Vec::new(),
            }),
            reminders: vec![10],
            attendees: Vec::new(),
            conference: None,
        }
    }

    #[test]
    fn writes_round_trip_through_caldir() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("caldir");
        calendar(&data, "work");
        calendar(&data, "home");
        let config = dir.path().join("config.toml");
        std::fs::write(&config, format!("calendar_dir = \"{}\"\n", data.display())).unwrap();
        let state = AppState::load_from(config, ProviderDirs::default()).unwrap();
        let utc = chrono_tz::UTC;

        let created = create_event(
            &state,
            "work",
            &fields("Planning", "2026-10-07 09:00", "2026-10-07 10:00", None),
            utc,
        )
        .unwrap();
        assert_eq!(created.summary, "Planning");
        assert_eq!(created.reminders, vec![10]);
        assert_eq!(created.description.as_deref(), Some("Notes"));
        // 09:00 Stockholm is 07:00 UTC.
        assert_eq!(created.date_info.start_local_minutes, 7 * 60);

        // Edit and move to another calendar.
        let target = EventKeyParts::of(&created);
        let mut edited = EventFields::of(&created);
        edited.summary = "Planning v2".into();
        update_event(&state, &target, Some("home".into()), &edited).unwrap();
        // A move gets a new UID, so providers see a new event.
        let range = DateRange {
            start: "2026-10-01".parse().unwrap(),
            end: "2026-11-01".parse().unwrap(),
        };
        let home = list_events(&state, vec!["home".into()], range, utc).unwrap();
        let moved = home
            .iter()
            .find(|e| e.summary == "Planning v2")
            .unwrap()
            .clone();
        assert!(
            get_event(&state, "work", &created.id, utc)
                .unwrap()
                .is_none()
        );

        delete_event(&state, &EventKeyParts::of(&moved)).unwrap();
        assert!(get_event(&state, "home", &moved.id, utc).unwrap().is_none());

        // A series split at an occurrence returns the new master.
        let series = create_event(
            &state,
            "work",
            &fields(
                "Standup",
                "2026-10-05 09:00",
                "2026-10-05 09:15",
                Some("FREQ=DAILY;COUNT=10"),
            ),
            utc,
        )
        .unwrap();
        let at = EventTimeRange::new(
            fields("", "2026-10-08 09:00", "2026-10-08 09:15", None).start,
            fields("", "2026-10-08 09:00", "2026-10-08 09:15", None).end,
        );
        let master = split_series(&state, "work", &series.id, &at, None, utc).unwrap();
        assert_ne!(master.id, series.id);
        assert!(master.recurrence.is_none());
        delete_series(&state, "work", &series.id).unwrap();
        assert!(
            get_event(&state, "work", &series.id, utc)
                .unwrap()
                .is_none()
        );
    }
}
