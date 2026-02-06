use crate::routes::TauResult;
use caldir_core::caldir::Caldir;
use caldir_core::event::{EventStatus, EventTime};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Serialize, Deserialize, Type)]
pub struct Calendar {
    pub slug: String,
    pub name: Option<String>,
    pub color: Option<String>,
    pub provider: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Type)]
pub struct Recurrence {
    pub rrule: String,
    pub exdates: Vec<String>,
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
    pub reminders: Vec<i32>,
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
        }
    }
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
    fn from_event(e: &caldir_core::event::Event, calendar_slug: &str) -> Self {
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
            reminders: e.reminders.iter().map(|r| r.minutes as i32).collect(),
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
        let range_start: DateTime<Utc> = start
            .parse()
            .map_err(|e: chrono::ParseError| e.to_string())?;

        let range_end: DateTime<Utc> =
            end.parse().map_err(|e: chrono::ParseError| e.to_string())?;

        let mut events = Vec::new();

        for slug in &calendar_slugs {
            let calendar =
                caldir_core::calendar::Calendar::load(slug).map_err(|e| e.to_string())?;

            for ce in calendar.events().map_err(|e| e.to_string())? {
                if let Some(event_start) = ce.event.start.to_utc() {
                    if event_start >= range_start && event_start <= range_end {
                        events.push(CalendarEvent::from_event(&ce.event, slug));
                    }
                }
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

        let event = calendar
            .events()
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|ce| ce.event.unique_id() == event_id)
            .map(|ce| CalendarEvent::from_event(&ce.event, &calendar_slug));

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

        let event = caldir_core::event::Event::new(input.summary, start.clone(), end.clone());
        let event = caldir_core::event::Event {
            description: input.description,
            location: input.location,
            recurrence,
            ..event
        };

        calendar.create_event(&event).map_err(|e| e.to_string())?;

        Ok(CalendarEvent::from_event(&event, &input.calendar_slug))
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
            reminders: existing.event.reminders.clone(),
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
}
