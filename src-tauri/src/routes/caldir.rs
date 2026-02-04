use crate::routes::TauResult;
use caldir_core::caldir::Caldir;
use caldir_core::event::EventStatus;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Serialize, Deserialize, Type)]
pub struct Calendar {
    pub slug: String,
    pub name: Option<String>,
    pub color: Option<String>,
    pub provider: Option<String>,
}

#[derive(Serialize, Deserialize, Type)]
pub struct Event {
    pub id: String,
    pub summary: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: String,
    pub end: String,
    pub all_day: bool,
    pub status: String,
    pub recurrence: Option<Vec<String>>,
    pub reminders: Vec<i32>,
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

impl From<&caldir_core::event::Event> for Event {
    fn from(e: &caldir_core::event::Event) -> Self {
        Event {
            id: e.id.clone(),
            summary: e.summary.clone(),
            description: e.description.clone(),
            location: e.location.clone(),
            start: e.start.to_string(),
            end: e.end.to_string(),
            all_day: e.start.is_date(),
            status: match e.status {
                EventStatus::Confirmed => "confirmed".to_string(),
                EventStatus::Tentative => "tentative".to_string(),
                EventStatus::Cancelled => "cancelled".to_string(),
            },
            recurrence: e.recurrence.clone(),
            reminders: e.reminders.iter().map(|r| r.minutes as i32).collect(),
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
    ) -> TauResult<Vec<Event>>;
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
    ) -> TauResult<Vec<Event>> {
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
                        events.push(Event::from(&ce.event));
                    }
                }
            }
        }

        events.sort_by(|a, b| a.start.cmp(&b.start));

        Ok(events)
    }
}
