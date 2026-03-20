use crate::routes::TauResult;
use caldir_core::caldir::Caldir;
use caldir_core::event::{EventStatus, EventTime, ParticipationStatus};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize, Deserialize, Type)]
pub struct Calendar {
    pub slug: String,
    pub name: Option<String>,
    pub color: Option<String>,
    pub provider: Option<String>,
    pub account: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Type)]
pub struct Recurrence {
    pub rrule: String,
    pub exdates: Vec<String>,
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
    pub start: String,
    pub end: String,
    pub all_day: bool,
    pub status: String,
    pub recurrence: Option<Recurrence>,
    pub master_recurrence: Option<Recurrence>,
    pub reminders: Vec<i32>,
    pub organizer: Option<EventAttendee>,
    pub attendees: Vec<EventAttendee>,
    pub conference_url: Option<String>,
    pub calendar_slug: String,
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
    pub start: String,
    pub end: String,
    pub all_day: bool,
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
    pub start: String,
    pub end: String,
    pub all_day: bool,
    pub recurrence: Option<Recurrence>,
    pub reminders: Vec<i32>,
}

/// Parse an ISO datetime string to EventTime
fn parse_event_time(s: &str, all_day: bool) -> Result<EventTime, String> {
    if all_day {
        // Parse as date only (take first 10 chars: YYYY-MM-DD)
        let date_str = &s[..10];
        let date = NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
            .map_err(|e| format!("Invalid date: {}", e))?;
        Ok(EventTime::Date(date))
    } else {
        // Parse as UTC datetime
        let dt: DateTime<Utc> = s.parse().map_err(|e: chrono::ParseError| e.to_string())?;
        Ok(EventTime::DateTimeUtc(dt))
    }
}

/// Parse an ISO datetime string, preserving the original EventTime's timezone.
/// - If the instant hasn't changed, returns the original as-is.
/// - If the instant changed but the original had a TZID, converts the new UTC
///   time back to that timezone so the ICS file keeps its TZID parameter.
fn parse_event_time_preserving_tz(
    s: &str,
    all_day: bool,
    original: &EventTime,
) -> Result<EventTime, String> {
    let parsed = parse_event_time(s, all_day)?;

    // If the UTC instant matches, keep the original to preserve timezone info
    if parsed.to_utc() == original.to_utc() {
        return Ok(original.clone());
    }

    // Time changed — convert back to the original timezone if it had one
    if let EventTime::DateTimeZoned { tzid, .. } = original {
        if let EventTime::DateTimeUtc(utc_dt) = &parsed {
            if let Ok(tz) = tzid.parse::<chrono_tz::Tz>() {
                let zoned = utc_dt.with_timezone(&tz);
                return Ok(EventTime::DateTimeZoned {
                    datetime: zoned.naive_local(),
                    tzid: tzid.clone(),
                });
            }
        }
    }

    Ok(parsed)
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
            start: e.start.to_iso_string(),
            end: e.end.to_iso_string(),
            all_day: e.start.is_date(),
            status: match e.status {
                EventStatus::Confirmed => "confirmed".to_string(),
                EventStatus::Tentative => "tentative".to_string(),
                EventStatus::Cancelled => "cancelled".to_string(),
            },
            recurrence: e.recurrence.as_ref().map(|r| Recurrence {
                rrule: r.rrule.clone(),
                exdates: r.exdates.iter().map(|d| d.to_string()).collect(),
            }),
            master_recurrence,
            reminders: e.reminders.iter().map(|r| r.minutes as i32).collect(),
            organizer: e.organizer.as_ref().map(EventAttendee::from),
            attendees: e.attendees.iter().map(EventAttendee::from).collect(),
            conference_url: e.conference_url.clone(),
            calendar_slug: calendar_slug.to_string(),
        }
    }
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

    async fn search_events(
        calendar_slugs: Vec<String>,
        query: String,
    ) -> TauResult<Vec<CalendarEvent>>;

    async fn list_invites(calendar_slugs: Vec<String>) -> TauResult<Vec<CalendarEvent>>;
    async fn rsvp(calendar_slug: String, event_id: String, response: String) -> TauResult<()>;

    async fn sync(calendar_slugs: Vec<String>) -> TauResult<()>;

    async fn list_providers() -> TauResult<Vec<String>>;

    async fn get_provider_connect_info(
        provider_name: String,
    ) -> TauResult<ProviderConnectInfo>;

    async fn connect_provider<R: Runtime>(
        app_handle: AppHandle<R>,
        provider_name: String,
    ) -> TauResult<Vec<Calendar>>;

    async fn connect_provider_with_credentials(
        provider_name: String,
        credentials: Vec<CredentialFieldInput>,
    ) -> TauResult<Vec<Calendar>>;
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
                    ce.event.recurrence.as_ref().map(|r| {
                        (
                            ce.event.uid.clone(),
                            Recurrence {
                                rrule: r.rrule.clone(),
                                exdates: r.exdates.iter().map(|d| d.to_string()).collect(),
                            },
                        )
                    })
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

        events.sort_by(|a, b| a.start.cmp(&b.start));

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
                        .and_then(|master| {
                            master.recurrence.as_ref().map(|r| Recurrence {
                                rrule: r.rrule.clone(),
                                exdates: r.exdates.iter().map(|d| d.to_string()).collect(),
                            })
                        })
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

        let start = parse_event_time(&input.start, input.all_day)?;
        let end = parse_event_time(&input.end, input.all_day)?;

        // Parse recurrence if provided
        let recurrence = match input.recurrence {
            Some(r) => {
                let exdates: Result<Vec<EventTime>, String> = r
                    .exdates
                    .iter()
                    .map(|s| parse_event_time(s, false))
                    .collect();
                Some(caldir_core::event::Recurrence {
                    rrule: r.rrule,
                    exdates: exdates?,
                })
            }
            None => None,
        };

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

        // Preserve original timezone if the time instant hasn't changed
        let start = parse_event_time_preserving_tz(
            &input.start,
            input.all_day,
            &existing.event.start,
        )?;
        let end =
            parse_event_time_preserving_tz(&input.end, input.all_day, &existing.event.end)?;

        // Parse recurrence if provided
        let recurrence = match input.recurrence {
            Some(r) => {
                let exdates: Result<Vec<EventTime>, String> = r
                    .exdates
                    .iter()
                    .map(|s| parse_event_time(s, false))
                    .collect();
                Some(caldir_core::event::Recurrence {
                    rrule: r.rrule,
                    exdates: exdates?,
                })
            }
            None => None,
        };

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
                let is_future = event.end.to_utc().map_or(true, |dt| dt >= now);
                if event.is_pending_invite_for(&email) && is_future {
                    invites.push(CalendarEvent::from_event(event, slug, None));
                }
            }
        }

        invites.sort_by(|a, b| a.start.cmp(&b.start));
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

    async fn sync(self, calendar_slugs: Vec<String>) -> TauResult<()> {
        use caldir_core::date_range::DateRange;
        use caldir_core::diff::CalendarDiff;

        let range = DateRange::default();

        for slug in &calendar_slugs {
            let calendar = caldir_core::calendar::Calendar::load(slug)
                .map_err(|e| format!("[{}] {}", slug, e))?;

            let diff = CalendarDiff::from_calendar(&calendar, &range)
                .await
                .map_err(|e| format!("[{}] {}", slug, e))?;

            diff.apply_pull()
                .map_err(|e| format!("[{}] {}", slug, e))?;
            diff.apply_push()
                .await
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
                        (
                            map_fields(setup_data.fields),
                            Some(setup_data.instructions),
                        )
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
                    credentials
                        .insert(key, serde_json::Value::String(value));
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

/// Parse a start string (either RFC3339 datetime or "YYYY-MM-DD" date) into seconds from epoch.
fn start_to_timestamp(start: &str) -> Option<i64> {
    if let Ok(dt) = start.parse::<DateTime<Utc>>() {
        return Some(dt.timestamp());
    }
    if let Ok(date) = start.parse::<NaiveDate>() {
        return Some(date.and_hms_opt(0, 0, 0)?.and_utc().timestamp());
    }
    None
}

/// Sort calendar events so that events closest to now appear first.
fn sort_by_proximity_to_now(events: &mut [CalendarEvent]) {
    let now = Utc::now().timestamp();
    events.sort_by_key(|e| {
        start_to_timestamp(&e.start)
            .map(|ts| (ts - now).unsigned_abs())
            .unwrap_or(u64::MAX)
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_event(start: &str) -> CalendarEvent {
        CalendarEvent {
            id: String::new(),
            recurring_event_id: None,
            summary: String::new(),
            description: None,
            location: None,
            start: start.to_string(),
            end: start.to_string(),
            all_day: !start.contains('T'),
            status: "confirmed".to_string(),
            calendar_slug: String::new(),
            recurrence: None,
            master_recurrence: None,
            reminders: vec![],
            organizer: None,
            attendees: vec![],
            conference_url: None,
        }
    }

    #[test]
    fn sorts_by_proximity_to_now() {
        let mut events = vec![
            make_event("2015-04-01"),
            make_event("2026-05-17"),
            make_event("2024-12-25T10:00:00+00:00"),
        ];

        sort_by_proximity_to_now(&mut events);

        // 2026-05-17 is closest to now (2026-03-14), then 2024-12-25, then 2015-04-01
        assert_eq!(events[0].start, "2026-05-17");
        assert_eq!(events[1].start, "2024-12-25T10:00:00+00:00");
        assert_eq!(events[2].start, "2015-04-01");
    }
}
