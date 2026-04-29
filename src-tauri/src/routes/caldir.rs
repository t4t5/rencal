use crate::routes::TauResult;
use caldir_core::caldir::Caldir;
use caldir_core::event::{EventStatus, EventTime, ParticipationStatus};
use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;

/// Number of pending push deletions that triggers the mass-delete safeguard.
/// Mirrors `caldir-cli`'s `guards::MASS_DELETE_THRESHOLD`.
const MASS_DELETE_THRESHOLD: u32 = 10;

#[derive(Serialize, Deserialize, Type)]
pub struct Calendar {
    pub slug: String,
    pub name: Option<String>,
    pub color: Option<String>,
    pub provider: Option<String>,
    pub account: Option<String>,
    pub read_only: Option<bool>,
}

/// JSCalendar/RFC 8984-shaped event time. Mirrors caldir-core's `EventTime` 1:1
/// so the RPC format is lossless: zoned events keep their IANA zone identity,
/// all-day stays date-only, UTC and floating round-trip faithfully.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RpcEventTime {
    /// All-day event. ISO date "YYYY-MM-DD".
    Date { date: String },
    /// Genuine UTC instant. ISO 8601 with Z suffix.
    DatetimeUtc { instant: String },
    /// Floating local time (no zone). ISO 8601 wall-clock without offset.
    DatetimeFloating { wallclock: String },
    /// Wall-clock + IANA zone — the canonical shape for authored timed events.
    DatetimeZoned { wallclock: String, tzid: String },
}

#[derive(Clone, Serialize, Deserialize, Type)]
pub struct Recurrence {
    pub rrule: String,
    pub exdates: Vec<RpcEventTime>,
}

#[derive(Clone, Serialize, Deserialize, Type)]
pub enum TimeFormat {
    #[serde(rename = "24h")]
    H24,
    #[serde(rename = "12h")]
    H12,
}

#[derive(Clone, Serialize, Deserialize, Type)]
pub enum ResponseStatus {
    #[serde(rename = "accepted")]
    Accepted,
    #[serde(rename = "declined")]
    Declined,
    #[serde(rename = "tentative")]
    Tentative,
    #[serde(rename = "needs-action")]
    NeedsAction,
}

#[derive(Clone, Serialize, Deserialize, Type)]
pub struct EventAttendee {
    pub name: Option<String>,
    pub email: String,
    pub response_status: Option<ResponseStatus>,
}

impl From<&caldir_core::event::Attendee> for EventAttendee {
    fn from(a: &caldir_core::event::Attendee) -> Self {
        EventAttendee {
            name: a.name.clone(),
            email: a.email.clone(),
            response_status: a.response_status.map(|s| match s {
                ParticipationStatus::Accepted => ResponseStatus::Accepted,
                ParticipationStatus::Declined => ResponseStatus::Declined,
                ParticipationStatus::Tentative => ResponseStatus::Tentative,
                ParticipationStatus::NeedsAction => ResponseStatus::NeedsAction,
            }),
        }
    }
}

#[derive(Serialize, Deserialize, Type)]
pub struct CalendarEvent {
    pub id: String,
    pub recurring_event_id: Option<String>,
    pub summary: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: RpcEventTime,
    pub end: RpcEventTime,
    pub status: String,
    pub recurrence: Option<Recurrence>,
    pub master_recurrence: Option<Recurrence>,
    pub reminders: Vec<i32>,
    pub organizer: Option<EventAttendee>,
    pub attendees: Vec<EventAttendee>,
    pub conference_url: Option<String>,
    pub calendar_slug: String,
    pub color: Option<String>,
    /// RFC 3339 timestamp of the event's last modification (DTSTAMP/LAST-MODIFIED).
    /// Used by the frontend to cheaply detect content changes for reload dedup.
    pub updated: Option<String>,
}

/// Map a Google Calendar event color ID (1–11) to its canonical hex color.
/// Source: Google Calendar API `colors.get`.
fn google_color_id_to_hex(id: &str) -> Option<&'static str> {
    match id {
        "1" => Some("#7986cb"),
        "2" => Some("#33b679"),
        "3" => Some("#8e24aa"),
        "4" => Some("#e67c73"),
        "5" => Some("#f6bf26"),
        "6" => Some("#f4511e"),
        "7" => Some("#039be5"),
        "8" => Some("#616161"),
        "9" => Some("#3f51b5"),
        "10" => Some("#0b8043"),
        "11" => Some("#d50000"),
        _ => None,
    }
}

impl From<&caldir_core::calendar::Calendar> for Calendar {
    fn from(c: &caldir_core::calendar::Calendar) -> Self {
        Calendar {
            slug: c.slug.clone(),
            name: c.config.name.clone(),
            color: c.config.color.clone(),
            provider: c
                .config
                .remote
                .as_ref()
                .map(|r| r.provider.name().to_string()),
            account: c
                .config
                .remote
                .as_ref()
                .and_then(|r| r.account_identifier().map(String::from)),
            read_only: c.config.read_only,
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Type)]
pub struct CredentialFieldInput {
    pub id: String,
    pub value: String,
}

#[derive(Clone, Serialize, Deserialize, Type)]
pub enum ProviderConnectStepKind {
    #[serde(rename = "oauth_redirect")]
    OAuthRedirect,
    #[serde(rename = "hosted_oauth")]
    HostedOAuth,
    #[serde(rename = "credentials")]
    Credentials,
    #[serde(rename = "needs_setup")]
    NeedsSetup,
}

#[derive(Clone, Serialize, Deserialize, Type)]
pub enum ProviderFieldType {
    #[serde(rename = "text")]
    Text,
    #[serde(rename = "password")]
    Password,
    #[serde(rename = "url")]
    Url,
}

#[derive(Clone, Serialize, Deserialize, Type)]
pub struct ProviderField {
    pub id: String,
    pub label: String,
    pub field_type: ProviderFieldType,
    pub required: bool,
    pub help: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Type)]
pub struct ProviderConnectInfo {
    pub step: ProviderConnectStepKind,
    pub fields: Vec<ProviderField>,
    pub instructions: Option<String>,
}

/// Input for creating an event
#[derive(Clone, Serialize, Deserialize, Type)]
pub struct CreateEventInput {
    pub calendar_slug: String,
    pub summary: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: RpcEventTime,
    pub end: RpcEventTime,
    pub recurrence: Option<Recurrence>,
    pub reminders: Vec<i32>,
}

/// Input for updating an event
#[derive(Clone, Serialize, Deserialize, Type)]
pub struct UpdateEventInput {
    pub id: String,
    pub calendar_slug: String,
    /// If set and different from calendar_slug, moves the event to this calendar
    pub new_calendar_slug: Option<String>,
    pub summary: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: RpcEventTime,
    pub end: RpcEventTime,
    pub recurrence: Option<Recurrence>,
    pub reminders: Vec<i32>,
}

/// Input for splitting a recurring series at a given instance.
///
/// Truncates the master's RRULE to end before `split_start`, then creates a new
/// master starting at `split_start` (carrying the original master's other fields)
/// with `new_recurrence`. Any override files at or after `split_start` are
/// deleted (the user's "all future events" choice supersedes them).
#[derive(Clone, Serialize, Deserialize, Type)]
pub struct SplitRecurringSeriesInput {
    pub calendar_slug: String,
    /// UID of the master event to split.
    pub master_uid: String,
    /// Start time of the instance from which the new series begins.
    pub split_start: RpcEventTime,
    /// End time of the new master (matches the duration the instance had).
    pub split_end: RpcEventTime,
    /// Recurrence rule for the new series. None means a single non-recurring event.
    pub new_recurrence: Option<Recurrence>,
}

/// Parse `YYYY-MM-DDTHH:MM:SS` (no offset, no Z) as a NaiveDateTime.
/// Tolerates an optional fractional seconds component.
fn parse_naive_datetime(s: &str) -> Result<NaiveDateTime, String> {
    NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S")
        .or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f"))
        .map_err(|e| format!("Invalid wallclock datetime '{}': {}", s, e))
}

/// Convert an RPC event time into caldir-core's `EventTime`.
/// 1:1 mapping; no instant computation for zoned times — the wallclock IS the
/// source of truth on disk.
fn rpc_time_to_core(w: &RpcEventTime) -> Result<EventTime, String> {
    match w {
        RpcEventTime::Date { date } => {
            let d = NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .map_err(|e| format!("Invalid date '{}': {}", date, e))?;
            Ok(EventTime::Date(d))
        }
        RpcEventTime::DatetimeUtc { instant } => {
            let dt: DateTime<Utc> = instant.parse().map_err(|e: chrono::ParseError| {
                format!("Invalid UTC instant '{}': {}", instant, e)
            })?;
            Ok(EventTime::DateTimeUtc(dt))
        }
        RpcEventTime::DatetimeFloating { wallclock } => Ok(EventTime::DateTimeFloating(
            parse_naive_datetime(wallclock)?,
        )),
        RpcEventTime::DatetimeZoned { wallclock, tzid } => {
            let datetime = parse_naive_datetime(wallclock)?;
            // Validate the tzid is a known IANA zone, but store the original string.
            tzid.parse::<chrono_tz::Tz>()
                .map_err(|e| format!("Unknown IANA timezone '{}': {}", tzid, e))?;
            Ok(EventTime::DateTimeZoned {
                datetime,
                tzid: tzid.clone(),
            })
        }
    }
}

/// Convert caldir-core's `EventTime` into the RPC shape. Inverse of
/// `rpc_time_to_core`; lossless across all four variants.
fn core_time_to_rpc(e: &EventTime) -> RpcEventTime {
    match e {
        EventTime::Date(d) => RpcEventTime::Date {
            date: d.format("%Y-%m-%d").to_string(),
        },
        EventTime::DateTimeUtc(dt) => RpcEventTime::DatetimeUtc {
            instant: dt.to_rfc3339(),
        },
        EventTime::DateTimeFloating(dt) => RpcEventTime::DatetimeFloating {
            wallclock: dt.format("%Y-%m-%dT%H:%M:%S").to_string(),
        },
        EventTime::DateTimeZoned { datetime, tzid } => RpcEventTime::DatetimeZoned {
            wallclock: datetime.format("%Y-%m-%dT%H:%M:%S").to_string(),
            tzid: tzid.clone(),
        },
    }
}

fn rpc_recurrence_to_core(r: &Recurrence) -> Result<caldir_core::event::Recurrence, String> {
    let exdates = r
        .exdates
        .iter()
        .map(rpc_time_to_core)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(caldir_core::event::Recurrence {
        rrule: r.rrule.clone(),
        exdates,
    })
}

fn core_recurrence_to_rpc(r: &caldir_core::event::Recurrence) -> Recurrence {
    Recurrence {
        rrule: r.rrule.clone(),
        exdates: r.exdates.iter().map(core_time_to_rpc).collect(),
    }
}

/// Sort key that orders RpcEventTime values by their UTC instant.
/// Returns `None` for unparseable values; `None` sorts before `Some`.
fn event_time_sort_key(w: &RpcEventTime) -> Option<DateTime<Utc>> {
    rpc_time_to_core(w).ok().and_then(|et| et.to_utc())
}

impl CalendarEvent {
    fn from_event(
        e: &caldir_core::event::Event,
        calendar_slug: &str,
        master_recurrence: Option<Recurrence>,
    ) -> Self {
        // If event has a recurrence_id, it's an instance of a recurring event
        // and the uid is the parent recurring event's ID
        let recurring_event_id = e.recurrence_id.as_ref().map(|_| e.uid.clone());

        CalendarEvent {
            id: e.unique_id(),
            recurring_event_id,
            summary: e.summary.clone(),
            description: e.description.clone(),
            location: e.location.clone(),
            start: core_time_to_rpc(&e.start),
            end: core_time_to_rpc(&e.end),
            status: match e.status {
                EventStatus::Confirmed => "confirmed".to_string(),
                EventStatus::Tentative => "tentative".to_string(),
                EventStatus::Cancelled => "cancelled".to_string(),
            },
            recurrence: e.recurrence.as_ref().map(core_recurrence_to_rpc),
            master_recurrence,
            reminders: e.reminders.iter().map(|r| r.minutes as i32).collect(),
            organizer: e.organizer.as_ref().map(EventAttendee::from),
            attendees: e.attendees.iter().map(EventAttendee::from).collect(),
            conference_url: e.conference_url.clone(),
            calendar_slug: calendar_slug.to_string(),
            color: e
                .custom_properties
                .iter()
                .find(|(k, _)| k == "X-GOOGLE-COLOR-ID")
                .and_then(|(_, v)| google_color_id_to_hex(v))
                .map(String::from),
            updated: e.updated.map(|dt| dt.to_rfc3339()),
        }
    }
}

#[derive(Serialize, Type)]
pub struct SyncPreview {
    pub calendar_slug: String,
    pub to_push_delete_count: u32,
}

#[taurpc::procedures(path = "caldir", export_to = "../src/rpc/bindings.ts")]
pub trait CaldirApi {
    async fn list_calendars() -> TauResult<Vec<Calendar>>;
    async fn list_events(
        calendar_slugs: Vec<String>,
        start: String,
        end: String,
    ) -> TauResult<Vec<CalendarEvent>>;
    async fn get_event(calendar_slug: String, event_id: String)
        -> TauResult<Option<CalendarEvent>>;
    async fn create_event(input: CreateEventInput) -> TauResult<CalendarEvent>;
    async fn update_event(input: UpdateEventInput) -> TauResult<()>;
    async fn delete_event(calendar_slug: String, event_id: String) -> TauResult<()>;
    async fn delete_recurring_series(calendar_slug: String, uid: String) -> TauResult<()>;
    async fn split_recurring_series_at(
        input: SplitRecurringSeriesInput,
    ) -> TauResult<CalendarEvent>;

    async fn search_events(
        calendar_slugs: Vec<String>,
        query: String,
    ) -> TauResult<Vec<CalendarEvent>>;

    async fn list_invites(calendar_slugs: Vec<String>) -> TauResult<Vec<CalendarEvent>>;
    async fn rsvp(calendar_slug: String, event_id: String, response: String) -> TauResult<()>;

    async fn sync_preview(calendar_slugs: Vec<String>) -> TauResult<Vec<SyncPreview>>;

    async fn sync(
        calendar_slugs: Vec<String>,
        allow_mass_delete: Vec<String>,
    ) -> TauResult<()>;

    async fn discard(calendar_slugs: Vec<String>) -> TauResult<()>;

    async fn list_providers() -> TauResult<Vec<String>>;

    async fn get_provider_connect_info(provider_name: String) -> TauResult<ProviderConnectInfo>;

    async fn connect_provider<R: Runtime>(
        app_handle: AppHandle<R>,
        provider_name: String,
    ) -> TauResult<Vec<Calendar>>;

    async fn connect_provider_with_credentials(
        provider_name: String,
        credentials: Vec<CredentialFieldInput>,
    ) -> TauResult<Vec<Calendar>>;

    async fn create_local_calendar(name: String, color: Option<String>) -> TauResult<Calendar>;

    async fn get_time_format() -> TauResult<TimeFormat>;
    async fn set_time_format(time_format: TimeFormat) -> TauResult<()>;

    async fn get_default_reminders() -> TauResult<Vec<i32>>;
    async fn set_default_reminders(minutes: Vec<i32>) -> TauResult<()>;

    async fn get_default_calendar() -> TauResult<Option<String>>;
    async fn set_default_calendar(slug: Option<String>) -> TauResult<()>;

    async fn get_calendar_dir() -> TauResult<String>;
    async fn set_calendar_dir(path: String) -> TauResult<()>;
}

#[derive(Clone)]
pub struct CaldirApiImpl;

#[taurpc::resolvers]
impl CaldirApi for CaldirApiImpl {
    async fn list_calendars(self) -> TauResult<Vec<Calendar>> {
        let caldir = Caldir::load().map_err(|e| e.to_string())?;

        let calendars = caldir.calendars().iter().map(Calendar::from).collect();

        Ok(calendars)
    }

    async fn list_events(
        self,
        calendar_slugs: Vec<String>,
        start: String,
        end: String,
    ) -> TauResult<Vec<CalendarEvent>> {
        use std::collections::HashMap;

        let range_start: DateTime<Utc> = start
            .parse()
            .map_err(|e: chrono::ParseError| e.to_string())?;

        let range_end: DateTime<Utc> =
            end.parse().map_err(|e: chrono::ParseError| e.to_string())?;

        let mut events = Vec::new();

        for slug in &calendar_slugs {
            let calendar =
                caldir_core::calendar::Calendar::load(slug).map_err(|e| e.to_string())?;

            // Build a map of master recurrences keyed by uid
            let all_events = calendar.events().map_err(|e| e.to_string())?;
            let master_recurrences: HashMap<String, Recurrence> = all_events
                .iter()
                .filter_map(|ce| {
                    ce.event
                        .recurrence
                        .as_ref()
                        .map(|r| (ce.event.uid.clone(), core_recurrence_to_rpc(r)))
                })
                .collect();

            for event in calendar
                .events_in_range(range_start, range_end)
                .map_err(|e| e.to_string())?
            {
                let master_rec = master_recurrences.get(&event.uid).cloned();
                events.push(CalendarEvent::from_event(&event, slug, master_rec));
            }
        }

        events.sort_by(|a, b| event_time_sort_key(&a.start).cmp(&event_time_sort_key(&b.start)));

        Ok(events)
    }

    async fn get_event(
        self,
        calendar_slug: String,
        event_id: String,
    ) -> TauResult<Option<CalendarEvent>> {
        let calendar =
            caldir_core::calendar::Calendar::load(&calendar_slug).map_err(|e| e.to_string())?;

        let found = calendar
            .events()
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|ce| ce.event.unique_id() == event_id);

        let event = match found {
            Some(ce) => {
                let master_rec = if ce.event.recurrence_id.is_some() {
                    calendar
                        .master_event_for(&ce.event.uid)
                        .map_err(|e| e.to_string())?
                        .and_then(|master| master.recurrence.as_ref().map(core_recurrence_to_rpc))
                } else {
                    None
                };
                Some(CalendarEvent::from_event(
                    &ce.event,
                    &calendar_slug,
                    master_rec,
                ))
            }
            None => None,
        };

        Ok(event)
    }

    async fn create_event(self, input: CreateEventInput) -> TauResult<CalendarEvent> {
        let calendar = caldir_core::calendar::Calendar::load(&input.calendar_slug)
            .map_err(|e| e.to_string())?;

        let start = rpc_time_to_core(&input.start)?;
        let end = rpc_time_to_core(&input.end)?;

        let recurrence = input
            .recurrence
            .as_ref()
            .map(rpc_recurrence_to_core)
            .transpose()?;

        let reminders = input
            .reminders
            .iter()
            .map(|&m| caldir_core::event::Reminder { minutes: m as i64 })
            .collect();

        let event = caldir_core::event::Event::new(
            input.summary,
            start,
            end,
            input.description,
            input.location,
            recurrence,
            reminders,
        );

        calendar.create_event(&event).map_err(|e| e.to_string())?;

        Ok(CalendarEvent::from_event(
            &event,
            &input.calendar_slug,
            None,
        ))
    }

    async fn update_event(self, input: UpdateEventInput) -> TauResult<()> {
        let calendar = caldir_core::calendar::Calendar::load(&input.calendar_slug)
            .map_err(|e| e.to_string())?;

        // Find the existing event by unique_id
        let existing = calendar
            .events()
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|ce| ce.event.unique_id() == input.id)
            .ok_or_else(|| format!("Event not found: {}", input.id))?;

        let start = rpc_time_to_core(&input.start)?;
        let end = rpc_time_to_core(&input.end)?;

        let recurrence = input
            .recurrence
            .as_ref()
            .map(rpc_recurrence_to_core)
            .transpose()?;

        let reminders = input
            .reminders
            .iter()
            .map(|&m| caldir_core::event::Reminder { minutes: m as i64 })
            .collect();

        // Build updated event, preserving fields we don't modify
        let updated_event = caldir_core::event::Event {
            uid: existing.event.uid.clone(),
            summary: input.summary,
            description: input.description,
            location: input.location,
            start,
            end,
            status: existing.event.status.clone(),
            recurrence,
            recurrence_id: existing.event.recurrence_id.clone(),
            reminders,
            transparency: existing.event.transparency.clone(),
            organizer: existing.event.organizer.clone(),
            attendees: existing.event.attendees.clone(),
            conference_url: existing.event.conference_url.clone(),
            updated: Some(Utc::now()),
            sequence: existing.event.sequence.map(|s| s + 1).or(Some(1)),
            custom_properties: existing.event.custom_properties.clone(),
        };

        // Check if we're moving the event to a different calendar
        let moving = input
            .new_calendar_slug
            .as_ref()
            .is_some_and(|new_slug| new_slug != &input.calendar_slug);

        if moving {
            let target_calendar =
                caldir_core::calendar::Calendar::load(input.new_calendar_slug.as_ref().unwrap())
                    .map_err(|e| e.to_string())?;

            // New UID so remote providers treat it as a fresh event
            let moved_event = updated_event.with_new_uid();

            // Create in target calendar first (safe: if this fails, original is untouched)
            target_calendar
                .create_event(&moved_event)
                .map_err(|e| e.to_string())?;

            // Only delete from source after successful creation
            calendar
                .delete_event(&existing.event.uid, existing.event.recurrence_id.as_ref())
                .map_err(|e| e.to_string())?;
        } else {
            calendar
                .update_event(&existing.event.uid, &updated_event)
                .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    async fn delete_event(self, calendar_slug: String, event_id: String) -> TauResult<()> {
        let calendar =
            caldir_core::calendar::Calendar::load(&calendar_slug).map_err(|e| e.to_string())?;

        // Find the event to get its uid and recurrence_id
        let event = calendar
            .events()
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|ce| ce.event.unique_id() == event_id)
            .ok_or_else(|| format!("Event not found: {}", event_id))?;

        calendar
            .delete_event(&event.event.uid, event.event.recurrence_id.as_ref())
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    async fn delete_recurring_series(self, calendar_slug: String, uid: String) -> TauResult<()> {
        let calendar =
            caldir_core::calendar::Calendar::load(&calendar_slug).map_err(|e| e.to_string())?;

        // Find all events with this uid (parent + instances)
        let events_to_delete: Vec<_> = calendar
            .events()
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter(|ce| ce.event.uid == uid)
            .collect();

        for ce in events_to_delete {
            calendar
                .delete_event(&ce.event.uid, ce.event.recurrence_id.as_ref())
                .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    async fn split_recurring_series_at(
        self,
        input: SplitRecurringSeriesInput,
    ) -> TauResult<CalendarEvent> {
        let calendar = caldir_core::calendar::Calendar::load(&input.calendar_slug)
            .map_err(|e| e.to_string())?;

        // Confirm the master exists before we split.
        calendar
            .master_event_for(&input.master_uid)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Master event not found: {}", input.master_uid))?;

        let split_start = rpc_time_to_core(&input.split_start)?;
        let split_end = rpc_time_to_core(&input.split_end)?;

        let new_recurrence = input
            .new_recurrence
            .as_ref()
            .map(rpc_recurrence_to_core)
            .transpose()?;

        let new_master = calendar
            .split_recurring_series_at(&input.master_uid, split_start, split_end, new_recurrence)
            .map_err(|e| e.to_string())?;

        Ok(CalendarEvent::from_event(
            &new_master,
            &input.calendar_slug,
            None,
        ))
    }

    async fn search_events(
        self,
        calendar_slugs: Vec<String>,
        query: String,
    ) -> TauResult<Vec<CalendarEvent>> {
        let mut events = Vec::new();

        for slug in &calendar_slugs {
            let calendar =
                caldir_core::calendar::Calendar::load(slug).map_err(|e| e.to_string())?;

            for ce in calendar.search_events(&query).map_err(|e| e.to_string())? {
                events.push(CalendarEvent::from_event(&ce.event, slug, None));
            }
        }

        sort_by_proximity_to_now(&mut events);

        Ok(events)
    }

    async fn list_invites(self, calendar_slugs: Vec<String>) -> TauResult<Vec<CalendarEvent>> {
        let now = Utc::now();
        let mut invites = Vec::new();

        for slug in &calendar_slugs {
            let calendar =
                caldir_core::calendar::Calendar::load(slug).map_err(|e| e.to_string())?;

            let email = match calendar.account_email() {
                Some(e) => e.to_string(),
                None => continue,
            };

            for ce in calendar.events().map_err(|e| e.to_string())? {
                let event = &ce.event;
                let is_future = event.end.to_utc().is_none_or(|dt| dt >= now);
                if event.is_pending_invite_for(&email) && is_future {
                    invites.push(CalendarEvent::from_event(event, slug, None));
                }
            }
        }

        invites.sort_by(|a, b| event_time_sort_key(&a.start).cmp(&event_time_sort_key(&b.start)));
        Ok(invites)
    }

    async fn rsvp(
        self,
        calendar_slug: String,
        event_id: String,
        response: String,
    ) -> TauResult<()> {
        let calendar =
            caldir_core::calendar::Calendar::load(&calendar_slug).map_err(|e| e.to_string())?;

        let email = calendar
            .account_email()
            .ok_or_else(|| "Calendar has no account email".to_string())?
            .to_string();

        let ce = calendar
            .events()
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|ce| ce.event.unique_id() == event_id)
            .ok_or_else(|| format!("Event not found: {}", event_id))?;

        let status: ParticipationStatus = response.parse().map_err(|e: String| e)?;

        let updated_event = ce
            .event
            .with_response(&email, status)
            .ok_or_else(|| "Failed to update response".to_string())?;

        calendar
            .update_event(&ce.event.uid, &updated_event)
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    async fn sync_preview(self, calendar_slugs: Vec<String>) -> TauResult<Vec<SyncPreview>> {
        use caldir_core::date_range::DateRange;
        use caldir_core::diff::{CalendarDiff, DiffKind};

        let range = DateRange::default();
        let mut previews = Vec::with_capacity(calendar_slugs.len());

        for slug in &calendar_slugs {
            let calendar = caldir_core::calendar::Calendar::load(slug)
                .map_err(|e| format!("[{}] {}", slug, e))?;

            let diff = CalendarDiff::from_calendar(&calendar, &range)
                .await
                .map_err(|e| format!("[{}] {}", slug, e))?;

            let to_push_delete_count = diff
                .to_push
                .iter()
                .filter(|d| d.kind == DiffKind::Delete)
                .count() as u32;

            previews.push(SyncPreview {
                calendar_slug: slug.clone(),
                to_push_delete_count,
            });
        }

        Ok(previews)
    }

    async fn sync(
        self,
        calendar_slugs: Vec<String>,
        allow_mass_delete: Vec<String>,
    ) -> TauResult<()> {
        use caldir_core::date_range::DateRange;
        use caldir_core::diff::{CalendarDiff, DiffKind};

        let range = DateRange::default();

        for slug in &calendar_slugs {
            let calendar = caldir_core::calendar::Calendar::load(slug)
                .map_err(|e| format!("[{}] {}", slug, e))?;

            let diff = CalendarDiff::from_calendar(&calendar, &range)
                .await
                .map_err(|e| format!("[{}] {}", slug, e))?;

            diff.apply_pull().map_err(|e| format!("[{}] {}", slug, e))?;

            let push_delete_count = diff
                .to_push
                .iter()
                .filter(|d| d.kind == DiffKind::Delete)
                .count() as u32;

            let mass_delete_blocked = push_delete_count >= MASS_DELETE_THRESHOLD
                && !allow_mass_delete.contains(slug);

            if mass_delete_blocked {
                continue;
            }

            diff.apply_push()
                .await
                .map_err(|e| format!("[{}] {}", slug, e))?;
        }

        Ok(())
    }

    async fn discard(self, calendar_slugs: Vec<String>) -> TauResult<()> {
        use caldir_core::date_range::DateRange;
        use caldir_core::diff::CalendarDiff;

        let range = DateRange::default();

        for slug in &calendar_slugs {
            let calendar = caldir_core::calendar::Calendar::load(slug)
                .map_err(|e| format!("[{}] {}", slug, e))?;

            let diff = CalendarDiff::from_calendar(&calendar, &range)
                .await
                .map_err(|e| format!("[{}] {}", slug, e))?;

            diff.apply_discard()
                .map_err(|e| format!("[{}] {}", slug, e))?;
        }

        Ok(())
    }

    async fn list_providers(self) -> TauResult<Vec<String>> {
        use caldir_core::remote::provider::Provider;
        Ok(Provider::discover_installed())
    }

    async fn get_provider_connect_info(
        self,
        provider_name: String,
    ) -> TauResult<ProviderConnectInfo> {
        use caldir_core::remote::protocol::{
            ConnectResponse, ConnectStepKind, CredentialsData, SetupData,
        };
        use caldir_core::remote::provider::Provider;

        let provider = Provider::from_name(&provider_name);
        let port: u16 = 8080;
        let redirect_uri = format!("http://localhost:{}/callback", port);

        let mut options = serde_json::Map::new();
        options.insert(
            "redirect_uri".into(),
            serde_json::Value::String(redirect_uri),
        );
        options.insert("hosted".into(), serde_json::Value::Bool(true));

        let connect_response = provider
            .connect(options, serde_json::Map::new())
            .await
            .map_err(|e| format!("Connect info failed: {}", e))?;

        match connect_response {
            ConnectResponse::NeedsInput { step, data } => {
                let step_kind = match step {
                    ConnectStepKind::OAuthRedirect => ProviderConnectStepKind::OAuthRedirect,
                    ConnectStepKind::HostedOAuth => ProviderConnectStepKind::HostedOAuth,
                    ConnectStepKind::Credentials => ProviderConnectStepKind::Credentials,
                    ConnectStepKind::NeedsSetup => ProviderConnectStepKind::NeedsSetup,
                };

                let (fields, instructions) = match step {
                    ConnectStepKind::Credentials => {
                        let cred_data: CredentialsData = serde_json::from_value(data)
                            .map_err(|e| format!("Failed to parse credentials data: {}", e))?;
                        (map_fields(cred_data.fields), None)
                    }
                    ConnectStepKind::NeedsSetup => {
                        let setup_data: SetupData = serde_json::from_value(data)
                            .map_err(|e| format!("Failed to parse setup data: {}", e))?;
                        (map_fields(setup_data.fields), Some(setup_data.instructions))
                    }
                    _ => (Vec::new(), None),
                };

                Ok(ProviderConnectInfo {
                    step: step_kind,
                    fields,
                    instructions,
                })
            }
            ConnectResponse::Done { .. } => {
                Err("Provider completed without requesting input".to_string())
            }
        }
    }

    async fn connect_provider<R: Runtime>(
        self,
        app: AppHandle<R>,
        provider_name: String,
    ) -> TauResult<Vec<Calendar>> {
        use crate::oauth;
        use caldir_core::remote::protocol::{
            ConnectResponse, ConnectStepKind, HostedOAuthData, OAuthData,
        };
        use caldir_core::remote::provider::Provider;

        let provider = Provider::from_name(&provider_name);

        // Bind callback listener first on port 0 so the OS picks a free port
        let listener = oauth::server::create_localhost_listener(0)
            .map_err(|e| format!("Failed to start callback server: {}", e))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("Failed to get listener port: {}", e))?
            .port();
        let redirect_uri = format!("http://localhost:{}/callback", port);

        // Initialize connect flow with the actual callback port
        let mut options = serde_json::Map::new();
        options.insert(
            "redirect_uri".into(),
            serde_json::Value::String(redirect_uri.clone()),
        );
        options.insert("hosted".into(), serde_json::Value::Bool(true));

        let connect_response = provider
            .connect(options, serde_json::Map::new())
            .await
            .map_err(|e| format!("Connect init failed: {}", e))?;

        match connect_response {
            ConnectResponse::NeedsInput {
                step: ConnectStepKind::OAuthRedirect,
                data,
            } => {
                let oauth_data: OAuthData = serde_json::from_value(data)
                    .map_err(|e| format!("Failed to parse OAuth data: {}", e))?;

                let auth_url = url::Url::parse(&oauth_data.authorization_url)
                    .map_err(|e| format!("Invalid auth URL: {}", e))?;

                app.opener()
                    .open_url(auth_url.as_str(), None::<&str>)
                    .map_err(|e| format!("Failed to open browser: {}", e))?;

                let callback = oauth::server::handle_oauth_callback(listener, port)
                    .await
                    .map_err(|e| format!("OAuth callback failed: {}", e))?;

                let mut credentials = serde_json::Map::new();
                credentials.insert("code".into(), serde_json::Value::String(callback.code));
                credentials.insert("state".into(), serde_json::Value::String(callback.state));

                let mut opts = serde_json::Map::new();
                opts.insert(
                    "redirect_uri".into(),
                    serde_json::Value::String(redirect_uri),
                );

                save_provider_calendars(&provider, opts, credentials).await
            }
            ConnectResponse::NeedsInput {
                step: ConnectStepKind::HostedOAuth,
                data,
            } => {
                let hosted_data: HostedOAuthData = serde_json::from_value(data)
                    .map_err(|e| format!("Failed to parse HostedOAuth data: {}", e))?;

                let auth_url = url::Url::parse(&hosted_data.url)
                    .map_err(|e| format!("Invalid hosted auth URL: {}", e))?;

                app.opener()
                    .open_url(auth_url.as_str(), None::<&str>)
                    .map_err(|e| format!("Failed to open browser: {}", e))?;

                let params = oauth::server::handle_generic_callback(listener, port)
                    .await
                    .map_err(|e| format!("OAuth callback failed: {}", e))?;

                let mut credentials = serde_json::Map::new();
                for (key, value) in params {
                    credentials.insert(key, serde_json::Value::String(value));
                }

                let mut opts = serde_json::Map::new();
                opts.insert(
                    "redirect_uri".into(),
                    serde_json::Value::String(redirect_uri),
                );
                opts.insert("hosted".into(), serde_json::Value::Bool(true));

                save_provider_calendars(&provider, opts, credentials).await
            }
            _ => Err("Unsupported connect step for this flow".to_string()),
        }
    }

    async fn connect_provider_with_credentials(
        self,
        provider_name: String,
        credentials: Vec<CredentialFieldInput>,
    ) -> TauResult<Vec<Calendar>> {
        use caldir_core::remote::provider::Provider;

        let provider = Provider::from_name(&provider_name);

        let mut cred_map = serde_json::Map::new();
        for field in credentials {
            cred_map.insert(field.id, serde_json::Value::String(field.value));
        }

        save_provider_calendars(&provider, serde_json::Map::new(), cred_map).await
    }

    async fn create_local_calendar(
        self,
        name: String,
        color: Option<String>,
    ) -> TauResult<Calendar> {
        use caldir_core::calendar::config::CalendarConfig;

        let slug = caldir_core::calendar::Calendar::unique_slug_for(Some(&name))
            .map_err(|e| e.to_string())?;

        let config = CalendarConfig {
            name: Some(name),
            color,
            read_only: None,
            remote: None,
        };

        let cal = caldir_core::calendar::Calendar { slug, config };
        cal.save_config().map_err(|e| e.to_string())?;

        Ok(Calendar::from(&cal))
    }

    async fn get_time_format(self) -> TauResult<TimeFormat> {
        let caldir = Caldir::load().map_err(|e| e.to_string())?;
        let tf = match caldir.config().time_format {
            caldir_core::caldir_config::TimeFormat::H24 => TimeFormat::H24,
            caldir_core::caldir_config::TimeFormat::H12 => TimeFormat::H12,
        };
        Ok(tf)
    }

    async fn set_time_format(self, time_format: TimeFormat) -> TauResult<()> {
        let caldir = Caldir::load().map_err(|e| e.to_string())?;
        let core_tf = match time_format {
            TimeFormat::H24 => caldir_core::caldir_config::TimeFormat::H24,
            TimeFormat::H12 => caldir_core::caldir_config::TimeFormat::H12,
        };
        let mut config = caldir.config().clone();
        config.time_format = core_tf;
        config.save().map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn get_default_reminders(self) -> TauResult<Vec<i32>> {
        let caldir = Caldir::load().map_err(|e| e.to_string())?;
        let Some(strs) = caldir.config().default_reminders.as_ref() else {
            return Ok(Vec::new());
        };
        let minutes = strs
            .iter()
            .map(|s| {
                caldir_core::event::Reminder::from_duration_str(s)
                    .map(|r| r.minutes as i32)
                    .map_err(|e| e.to_string())
            })
            .collect::<TauResult<Vec<i32>>>()?;
        Ok(minutes)
    }

    async fn set_default_reminders(self, minutes: Vec<i32>) -> TauResult<()> {
        let caldir = Caldir::load().map_err(|e| e.to_string())?;
        let mut config = caldir.config().clone();
        config.default_reminders = if minutes.is_empty() {
            None
        } else {
            Some(minutes.iter().map(|m| format!("{m}m")).collect())
        };
        config.save().map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn get_default_calendar(self) -> TauResult<Option<String>> {
        let caldir = Caldir::load().map_err(|e| e.to_string())?;
        Ok(caldir.config().default_calendar.clone())
    }

    async fn set_default_calendar(self, slug: Option<String>) -> TauResult<()> {
        let caldir = Caldir::load().map_err(|e| e.to_string())?;
        let mut config = caldir.config().clone();
        config.default_calendar = slug;
        config.save().map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn get_calendar_dir(self) -> TauResult<String> {
        let caldir = Caldir::load().map_err(|e| e.to_string())?;
        Ok(caldir.config().calendar_dir.to_string_lossy().to_string())
    }

    async fn set_calendar_dir(self, path: String) -> TauResult<()> {
        let caldir = Caldir::load().map_err(|e| e.to_string())?;
        let mut config = caldir.config().clone();
        config.calendar_dir = std::path::PathBuf::from(tildify(&path));
        config.save().map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn tildify(path: &str) -> String {
    let Ok(home) = std::env::var("HOME") else {
        return path.to_string();
    };
    if home.is_empty() {
        return path.to_string();
    }
    if let Some(rest) = path.strip_prefix(&home) {
        if rest.is_empty() {
            return "~".to_string();
        }
        if rest.starts_with('/') {
            return format!("~{rest}");
        }
    }
    path.to_string()
}

fn map_fields(fields: Vec<caldir_core::remote::protocol::CredentialField>) -> Vec<ProviderField> {
    use caldir_core::remote::protocol::FieldType;

    fields
        .into_iter()
        .map(|f| ProviderField {
            id: f.id,
            label: f.label,
            field_type: match f.field_type {
                FieldType::Text => ProviderFieldType::Text,
                FieldType::Password => ProviderFieldType::Password,
                FieldType::Url => ProviderFieldType::Url,
            },
            required: f.required,
            help: f.help,
        })
        .collect()
}

/// Submit credentials to provider, list calendars, and save configs locally.
async fn save_provider_calendars(
    provider: &caldir_core::remote::provider::Provider,
    options: serde_json::Map<String, serde_json::Value>,
    credentials: serde_json::Map<String, serde_json::Value>,
) -> TauResult<Vec<Calendar>> {
    use caldir_core::remote::protocol::ConnectResponse;

    let connect_response = provider
        .connect(options, credentials)
        .await
        .map_err(|e| format!("Connect failed: {}", e))?;

    let account_identifier = match connect_response {
        ConnectResponse::Done {
            account_identifier, ..
        } => account_identifier,
        _ => return Err("Provider did not complete authentication".to_string()),
    };

    let provider_account = provider.provider_account(account_identifier);

    let calendar_configs = provider_account
        .list_calendars()
        .await
        .map_err(|e| format!("Failed to list calendars: {}", e))?;

    let mut calendars = Vec::new();
    for config in calendar_configs {
        let slug = caldir_core::calendar::Calendar::unique_slug_for(config.name.as_deref())
            .map_err(|e| e.to_string())?;

        let cal = caldir_core::calendar::Calendar { slug, config };
        cal.save_config().map_err(|e| e.to_string())?;
        calendars.push(Calendar::from(&cal));
    }

    Ok(calendars)
}

/// Sort calendar events so that events closest to now appear first.
fn sort_by_proximity_to_now(events: &mut [CalendarEvent]) {
    let now = Utc::now().timestamp();
    events.sort_by_key(|e| {
        event_time_sort_key(&e.start)
            .map(|dt| (dt.timestamp() - now).unsigned_abs())
            .unwrap_or(u64::MAX)
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_event(start: RpcEventTime) -> CalendarEvent {
        CalendarEvent {
            id: String::new(),
            recurring_event_id: None,
            summary: String::new(),
            description: None,
            location: None,
            start: start.clone(),
            end: start,
            status: "confirmed".to_string(),
            calendar_slug: String::new(),
            recurrence: None,
            master_recurrence: None,
            reminders: vec![],
            organizer: None,
            attendees: vec![],
            conference_url: None,
            color: None,
            updated: None,
        }
    }

    fn date(s: &str) -> RpcEventTime {
        RpcEventTime::Date {
            date: s.to_string(),
        }
    }

    fn utc(s: &str) -> RpcEventTime {
        RpcEventTime::DatetimeUtc {
            instant: s.to_string(),
        }
    }

    #[test]
    fn sorts_by_proximity_to_now() {
        let mut events = vec![
            make_event(date("2015-04-01")),
            make_event(date("2026-05-17")),
            make_event(utc("2024-12-25T10:00:00+00:00")),
        ];

        sort_by_proximity_to_now(&mut events);

        // 2026-05-17 is closest to now (2026-04-27), then 2024-12-25, then 2015-04-01
        assert_eq!(events[0].start, date("2026-05-17"));
        assert_eq!(events[1].start, utc("2024-12-25T10:00:00+00:00"));
        assert_eq!(events[2].start, date("2015-04-01"));
    }

    #[test]
    fn rpc_round_trip_date() {
        let w = RpcEventTime::Date {
            date: "2026-04-28".to_string(),
        };
        assert_eq!(core_time_to_rpc(&rpc_time_to_core(&w).unwrap()), w);
    }

    #[test]
    fn rpc_round_trip_utc() {
        let w = RpcEventTime::DatetimeUtc {
            instant: "2026-04-28T10:00:00+00:00".to_string(),
        };
        let round = core_time_to_rpc(&rpc_time_to_core(&w).unwrap());
        // Re-serialization may use a different equivalent form (Z vs +00:00),
        // so compare the parsed core values instead.
        assert_eq!(
            rpc_time_to_core(&w).unwrap(),
            rpc_time_to_core(&round).unwrap()
        );
    }

    #[test]
    fn rpc_round_trip_floating() {
        let w = RpcEventTime::DatetimeFloating {
            wallclock: "2026-04-28T12:00:00".to_string(),
        };
        assert_eq!(core_time_to_rpc(&rpc_time_to_core(&w).unwrap()), w);
    }

    #[test]
    fn rpc_round_trip_zoned() {
        let w = RpcEventTime::DatetimeZoned {
            wallclock: "2026-04-28T12:00:00".to_string(),
            tzid: "Europe/Stockholm".to_string(),
        };
        assert_eq!(core_time_to_rpc(&rpc_time_to_core(&w).unwrap()), w);
    }

    #[test]
    fn zoned_dst_round_trip_preserves_wallclock() {
        // Stockholm autumn DST transition: 03:00 CEST → 02:00 CET on 2026-10-25.
        // The wallclock 02:30 is ambiguous (occurs twice). The wallclock IS the
        // source of truth on disk — we keep it verbatim and let the consumer
        // resolve ambiguity if it ever needs the instant.
        let w = RpcEventTime::DatetimeZoned {
            wallclock: "2026-10-25T02:30:00".to_string(),
            tzid: "Europe/Stockholm".to_string(),
        };
        assert_eq!(core_time_to_rpc(&rpc_time_to_core(&w).unwrap()), w);
    }

    #[test]
    fn unknown_tzid_rejected() {
        let w = RpcEventTime::DatetimeZoned {
            wallclock: "2026-04-28T12:00:00".to_string(),
            tzid: "Not/AReal_Zone".to_string(),
        };
        assert!(rpc_time_to_core(&w).is_err());
    }
}
