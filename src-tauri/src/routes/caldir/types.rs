use caldir_core::{Attendee, Event, EventTime, ParticipationStatus, Recurrence, Status};
use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use specta::Type;

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
pub struct RpcRecurrence {
    pub rrule: String,
    pub exdates: Vec<RpcEventTime>,
}

#[derive(Clone, Serialize, Deserialize, Type)]
pub struct Contact {
    pub email: String,
    pub name: Option<String>,
    pub count: u32,
    pub last_seen: String,
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

impl EventAttendee {
    pub fn to_core(&self) -> Attendee {
        Attendee {
            email: self.email.clone(),
            name: self.name.clone(),
            status: self.response_status.as_ref().map(|s| match s {
                ResponseStatus::Accepted => ParticipationStatus::Accepted,
                ResponseStatus::Declined => ParticipationStatus::Declined,
                ResponseStatus::Tentative => ParticipationStatus::Tentative,
                ResponseStatus::NeedsAction => ParticipationStatus::NeedsAction,
            }),
        }
    }
}

impl From<&Attendee> for EventAttendee {
    fn from(a: &Attendee) -> Self {
        EventAttendee {
            name: a.name.clone(),
            email: a.email.clone(),
            response_status: a.status.map(|s| match s {
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
    pub recurrence: Option<RpcRecurrence>,
    pub master_recurrence: Option<RpcRecurrence>,
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
    pub recurrence: Option<RpcRecurrence>,
    pub reminders: Vec<i32>,
    pub attendees: Vec<EventAttendee>,
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
    pub recurrence: Option<RpcRecurrence>,
    pub reminders: Vec<i32>,
    pub attendees: Vec<EventAttendee>,
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
    pub new_recurrence: Option<RpcRecurrence>,
}

#[derive(Serialize, Type)]
pub struct SyncPreview {
    pub calendar_slug: String,
    pub to_push_count: u32,
    pub to_push_delete_count: u32,
    pub to_pull_count: u32,
}

/// Map a Google Calendar event color ID (1–11) to its canonical hex color.
/// Source: Google Calendar API `colors.get`.
pub fn google_color_id_to_hex(id: &str) -> Option<&'static str> {
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

impl From<&caldir_core::Calendar> for Calendar {
    fn from(c: &caldir_core::Calendar) -> Self {
        Calendar {
            slug: c.slug().map(String::from).unwrap_or_default(),
            name: c.name().map(String::from),
            color: c.color().map(String::from),
            provider: c.remote_config().map(|r| r.provider_slug().to_string()),
            account: c
                .remote_config()
                .and_then(|r| r.account_identifier().map(String::from)),
            read_only: c.read_only_setting(),
        }
    }
}

/// Parse `YYYY-MM-DDTHH:MM:SS` (no offset, no Z) as a NaiveDateTime.
/// Tolerates an optional fractional seconds component.
pub fn parse_naive_datetime(s: &str) -> Result<NaiveDateTime, String> {
    NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S")
        .or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f"))
        .map_err(|e| format!("Invalid wallclock datetime '{}': {}", s, e))
}

/// Convert an RPC event time into caldir-core's `EventTime`.
/// 1:1 mapping; no instant computation for zoned times — the wallclock IS the
/// source of truth on disk.
pub fn rpc_time_to_core(w: &RpcEventTime) -> Result<EventTime, String> {
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
pub fn core_time_to_rpc(e: &EventTime) -> RpcEventTime {
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

pub fn rpc_recurrence_to_core(r: &RpcRecurrence) -> Result<Recurrence, String> {
    let exdates = r
        .exdates
        .iter()
        .map(rpc_time_to_core)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Recurrence {
        rrule: r.rrule.clone(),
        exdates,
        rdates: Vec::new(),
    })
}

pub fn core_recurrence_to_rpc(r: &Recurrence) -> RpcRecurrence {
    RpcRecurrence {
        rrule: r.rrule.clone(),
        exdates: r.exdates.iter().map(core_time_to_rpc).collect(),
    }
}

impl CalendarEvent {
    pub fn from_event(
        e: &Event,
        calendar_slug: &str,
        master_recurrence: Option<RpcRecurrence>,
    ) -> Self {
        // If event has a recurrence_id, it's an instance of a recurring event
        // and the uid is the parent recurring event's ID
        let recurring_event_id = e.recurrence_id.as_ref().map(|_| e.uid.as_str().to_string());

        // end is Option<EventTime>; fall back to start so the RPC field stays required.
        let end_rpc = match &e.end {
            Some(end) => core_time_to_rpc(end),
            None => core_time_to_rpc(&e.start),
        };

        CalendarEvent {
            id: e.event_instance_id().to_string(),
            recurring_event_id,
            summary: e.summary.clone().unwrap_or_default(),
            description: e.description.clone(),
            location: e.location.clone(),
            start: core_time_to_rpc(&e.start),
            end: end_rpc,
            status: match e.status {
                Status::Confirmed => "confirmed".to_string(),
                Status::Tentative => "tentative".to_string(),
                Status::Cancelled => "cancelled".to_string(),
            },
            recurrence: e.recurrence.as_ref().map(core_recurrence_to_rpc),
            master_recurrence,
            reminders: e
                .reminders
                .iter()
                .map(|r| r.minutes_before_start as i32)
                .collect(),
            organizer: e.organizer.as_ref().map(|o| EventAttendee {
                name: o.name.clone(),
                email: o.email.clone(),
                response_status: None,
            }),
            attendees: e.attendees.iter().map(EventAttendee::from).collect(),
            conference_url: e.x_property("X-GOOGLE-CONFERENCE").map(String::from),
            calendar_slug: calendar_slug.to_string(),
            color: e
                .x_property("X-GOOGLE-COLOR-ID")
                .and_then(google_color_id_to_hex)
                .map(String::from),
            updated: e.last_modified.map(|dt| dt.to_rfc3339()),
        }
    }
}
