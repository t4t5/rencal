use crate::routes::TauResult;
use caldir_core::caldir::Caldir;
use caldir_core::event::{EventStatus, EventTime, ParticipationStatus};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Runtime};

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

    async fn list_invites(calendar_slugs: Vec<String>) -> TauResult<Vec<CalendarEvent>>;
    async fn rsvp(calendar_slug: String, event_id: String, response: String) -> TauResult<()>;

    async fn sync(calendar_slugs: Vec<String>) -> TauResult<()>;

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

        calendar
            .update_event(&existing.event.uid, &updated_event)
            .map_err(|e| e.to_string())?;

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
                let is_future = event.start.to_utc().map_or(true, |dt| dt >= now);
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

    async fn connect_provider<R: Runtime>(
        self,
        app: AppHandle<R>,
        provider_name: String,
    ) -> TauResult<Vec<Calendar>> {
        use crate::oauth;
        use caldir_core::remote::protocol::{ConnectResponse, ConnectStepKind, OAuthData};
        use caldir_core::remote::provider::Provider;

        let provider = Provider::from_name(&provider_name);
        let port: u16 = 8080;
        let redirect_uri = format!("http://localhost:{}/callback", port);

        // Step 1: Initialize connect flow — get OAuth URL from provider
        let mut options = serde_json::Map::new();
        options.insert(
            "redirect_uri".into(),
            serde_json::Value::String(redirect_uri.clone()),
        );

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

                // Step 2: Bind callback server BEFORE opening the popup so it's
                // ready when the browser redirects back
                let listener = oauth::server::create_localhost_listener(port)
                    .map_err(|e| format!("Failed to start callback server: {}", e))?;

                // Step 3: Open OAuth popup window
                let (popup, _close_rx) =
                    oauth::window::create_oauth_popup(&app, auth_url, "Sign in")
                        .map_err(|e| format!("Failed to open OAuth popup: {}", e))?;

                // Helper to ensure popup is closed on any error from here on
                let run = async {
                    // Step 4: Wait for the OAuth redirect callback
                    let callback = oauth::server::handle_oauth_callback(listener, port)
                        .await
                        .map_err(|e| format!("OAuth callback failed: {}", e))?;

                    // Step 5: Submit credentials to provider
                    let mut credentials = serde_json::Map::new();
                    credentials.insert("code".into(), serde_json::Value::String(callback.code));
                    credentials.insert("state".into(), serde_json::Value::String(callback.state));
                    credentials.insert(
                        "redirect_uri".into(),
                        serde_json::Value::String(redirect_uri),
                    );

                    save_provider_calendars(&provider, credentials).await
                };

                let result = run.await;
                let _ = popup.close();
                result
            }
            _ => Err("Only OAuth providers are currently supported".to_string()),
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

        save_provider_calendars(&provider, cred_map).await
    }
}

/// Submit credentials to provider, list calendars, and save configs locally.
async fn save_provider_calendars(
    provider: &caldir_core::remote::provider::Provider,
    credentials: serde_json::Map<String, serde_json::Value>,
) -> TauResult<Vec<Calendar>> {
    use caldir_core::remote::protocol::ConnectResponse;

    let connect_response = provider
        .connect(serde_json::Map::new(), credentials)
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
