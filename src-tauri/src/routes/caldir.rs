use caldir_core::caldir::Caldir;
use caldir_core::calendar::Calendar;
use caldir_core::event::EventStatus;
use serde::{Deserialize, Serialize};
use specta::Type;

// Bridge types for taurpc/specta serialization
// (caldir-core types don't derive specta::Type)

#[derive(Serialize, Deserialize, Type)]
pub struct CalendarInfo {
    pub slug: String,
    pub name: Option<String>,
    pub color: Option<String>,
}

#[derive(Serialize, Deserialize, Type)]
pub struct EventInfo {
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

impl From<&caldir_core::event::Event> for EventInfo {
    fn from(e: &caldir_core::event::Event) -> Self {
        EventInfo {
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
    async fn list_calendars() -> Result<Vec<CalendarInfo>, String>;
    async fn list_events(calendar_slug: String) -> Result<Vec<EventInfo>, String>;
}

#[derive(Clone)]
pub struct CaldirApiImpl;

#[taurpc::resolvers]
impl CaldirApi for CaldirApiImpl {
    async fn list_calendars(self) -> Result<Vec<CalendarInfo>, String> {
        let caldir = Caldir::load().map_err(|e| e.to_string())?;

        let calendars = caldir
            .calendars()
            .into_iter()
            .map(|c| CalendarInfo {
                slug: c.slug.clone(),
                name: c.config.name.clone(),
                color: c.config.color.clone(),
            })
            .collect();

        Ok(calendars)
    }

    async fn list_events(self, calendar_slug: String) -> Result<Vec<EventInfo>, String> {
        let calendar = Calendar::load(&calendar_slug).map_err(|e| e.to_string())?;

        let events = calendar
            .events()
            .map_err(|e| e.to_string())?
            .iter()
            .map(|ce| EventInfo::from(&ce.event))
            .collect();

        Ok(events)
    }
}
