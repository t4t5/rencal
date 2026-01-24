//! taurpc API for caldir-core integration.
//!
//! Thin adapter layer between caldir-core and the TypeScript frontend.
//! Uses DTO types that implement From<caldir_core::*> for serialization.

use caldir_core::caldir::Caldir;
use caldir_core::calendar::Calendar;
use caldir_core::event::{Event, EventStatus, EventTime, Transparency};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use specta::Type;

/// Calendar DTO for TypeScript consumption.
#[derive(Debug, Clone, Serialize, Type)]
pub struct CalendarDto {
    pub slug: String,
    pub name: String,
    pub color: Option<String>,
}

impl From<&Calendar> for CalendarDto {
    fn from(cal: &Calendar) -> Self {
        CalendarDto {
            slug: cal.slug.clone(),
            name: cal
                .config
                .name
                .clone()
                .unwrap_or_else(|| cal.slug.clone()),
            color: cal.config.color.clone(),
        }
    }
}

/// Event DTO for TypeScript consumption.
/// Flattens EventTime enum into start/end strings + allDay boolean.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EventDto {
    pub id: String,
    pub calendar_slug: String,
    pub summary: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: String,
    pub end: String,
    pub all_day: bool,
    pub status: String,
    pub is_recurring: bool,
    pub organizer_email: Option<String>,
}

/// Input DTO for creating events
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateEventInput {
    pub calendar_slug: String,
    pub summary: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: String,
    pub end: String,
    pub all_day: bool,
}

fn event_time_to_string(time: &EventTime) -> String {
    match time {
        EventTime::Date(d) => d.format("%Y-%m-%d").to_string(),
        EventTime::DateTimeUtc(dt) => dt.to_rfc3339(),
        EventTime::DateTimeFloating(dt) => dt.format("%Y-%m-%dT%H:%M:%S").to_string(),
        EventTime::DateTimeZoned { datetime, .. } => {
            datetime.format("%Y-%m-%dT%H:%M:%S").to_string()
        }
    }
}

fn parse_event_time(s: &str, all_day: bool) -> Result<EventTime, String> {
    use chrono::{DateTime, FixedOffset, NaiveDateTime, Utc};

    if all_day {
        // Parse as date only (YYYY-MM-DD)
        NaiveDate::parse_from_str(s, "%Y-%m-%d")
            .map(EventTime::Date)
            .or_else(|_| {
                // Try parsing as datetime and extract just the date
                DateTime::<FixedOffset>::parse_from_rfc3339(s)
                    .map(|dt| EventTime::Date(dt.date_naive()))
                    .map_err(|e| format!("Invalid date format: {}", e))
            })
    } else {
        // Parse as datetime
        DateTime::<FixedOffset>::parse_from_rfc3339(s)
            .map(|dt| EventTime::DateTimeUtc(dt.with_timezone(&Utc)))
            .or_else(|_| {
                // Try parsing as local datetime
                NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S")
                    .map(EventTime::DateTimeFloating)
                    .map_err(|e| format!("Invalid datetime format: {}", e))
            })
    }
}

fn event_status_to_string(status: &EventStatus) -> String {
    match status {
        EventStatus::Confirmed => "confirmed".to_string(),
        EventStatus::Tentative => "tentative".to_string(),
        EventStatus::Cancelled => "cancelled".to_string(),
    }
}

impl EventDto {
    fn from_event(event: &Event, calendar_slug: &str) -> Self {
        EventDto {
            id: event.id.clone(),
            calendar_slug: calendar_slug.to_string(),
            summary: event.summary.clone(),
            description: event.description.clone(),
            location: event.location.clone(),
            start: event_time_to_string(&event.start),
            end: event_time_to_string(&event.end),
            all_day: event.start.is_date(),
            status: event_status_to_string(&event.status),
            is_recurring: event.recurrence.is_some(),
            organizer_email: event.organizer.as_ref().map(|o| o.email.clone()),
        }
    }
}

#[taurpc::procedures(path = "caldir", export_to = "../src/rpc/bindings.ts")]
pub trait CaldirApi {
    async fn list_calendars() -> Result<Vec<CalendarDto>, String>;
    async fn list_events(calendar_slug: String) -> Result<Vec<EventDto>, String>;
    async fn list_all_events() -> Result<Vec<EventDto>, String>;
    async fn create_event(input: CreateEventInput) -> Result<EventDto, String>;
    async fn delete_event(calendar_slug: String, event_id: String) -> Result<(), String>;
}

#[derive(Clone)]
pub struct CaldirApiImpl;

#[taurpc::resolvers]
impl CaldirApi for CaldirApiImpl {
    async fn list_calendars(self) -> Result<Vec<CalendarDto>, String> {
        let caldir = Caldir::load().map_err(|e| format!("Failed to load caldir: {}", e))?;

        let calendars: Vec<CalendarDto> = caldir.calendars().iter().map(CalendarDto::from).collect();

        Ok(calendars)
    }

    async fn list_events(self, calendar_slug: String) -> Result<Vec<EventDto>, String> {
        let calendar = Calendar::load(&calendar_slug)
            .map_err(|e| format!("Failed to load calendar '{}': {}", calendar_slug, e))?;

        let calendar_events = calendar
            .events()
            .map_err(|e| format!("Failed to load events: {}", e))?;

        let events: Vec<EventDto> = calendar_events
            .iter()
            .map(|ce| EventDto::from_event(&ce.event, &calendar_slug))
            .collect();

        Ok(events)
    }

    async fn list_all_events(self) -> Result<Vec<EventDto>, String> {
        let caldir = Caldir::load().map_err(|e| format!("Failed to load caldir: {}", e))?;

        let mut all_events: Vec<EventDto> = Vec::new();

        for calendar in caldir.calendars() {
            if let Ok(calendar_events) = calendar.events() {
                for ce in calendar_events {
                    all_events.push(EventDto::from_event(&ce.event, &calendar.slug));
                }
            }
        }

        // Sort by start time
        all_events.sort_by(|a, b| a.start.cmp(&b.start));

        Ok(all_events)
    }

    async fn create_event(self, input: CreateEventInput) -> Result<EventDto, String> {
        let calendar = Calendar::load(&input.calendar_slug)
            .map_err(|e| format!("Failed to load calendar '{}': {}", input.calendar_slug, e))?;

        let start = parse_event_time(&input.start, input.all_day)?;
        let end = parse_event_time(&input.end, input.all_day)?;

        let event = Event {
            id: format!("local-{}", uuid::Uuid::new_v4()),
            summary: input.summary,
            description: input.description,
            location: input.location,
            start,
            end,
            status: EventStatus::Confirmed,
            recurrence: None,
            original_start: None,
            reminders: vec![],
            transparency: Transparency::Opaque,
            organizer: None,
            attendees: vec![],
            conference_url: None,
            updated: None,
            sequence: None,
            custom_properties: vec![],
        };

        calendar
            .create_event(&event)
            .map_err(|e| format!("Failed to create event: {}", e))?;

        Ok(EventDto::from_event(&event, &input.calendar_slug))
    }

    async fn delete_event(self, calendar_slug: String, event_id: String) -> Result<(), String> {
        let calendar = Calendar::load(&calendar_slug)
            .map_err(|e| format!("Failed to load calendar '{}': {}", calendar_slug, e))?;

        calendar
            .delete_event(&event_id)
            .map_err(|e| format!("Failed to delete event: {}", e))?;

        Ok(())
    }
}
