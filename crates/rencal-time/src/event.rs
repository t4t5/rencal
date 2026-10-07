//! The app-side event model (port of `src/lib/cal-events.ts` and the pure parts
//! of `src/lib/event-utils.ts`). Serde reads and writes the RPC shape
//! (`CalendarEvent` in the old `src/rpc/bindings.ts`), with `EventTime`s parsed.
//!
//! `date_info` is derived from `start`/`end` in the viewer's zone and is not
//! serialized: anything that builds or deserializes an event calls
//! `refresh_date_info` (or `set_dates`), and the event store calls it again
//! for every event when the viewer's zone changes.

use std::collections::HashSet;

use chrono::NaiveDate;
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};

use crate::day::add_months_to_month_start;
use crate::{EventDateInfo, EventTime};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Recurrence {
    pub rrule: String,
    #[serde(default)]
    pub exdates: Vec<EventTime>,
    #[serde(default)]
    pub rdates: Vec<EventTime>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EventStatus {
    #[default]
    Confirmed,
    Tentative,
    Cancelled,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
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

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct EventAttendee {
    #[serde(default)]
    pub name: Option<String>,
    pub email: String,
    #[serde(default)]
    pub response_status: Option<ResponseStatus>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConferenceProvider {
    Google,
    Outlook,
    Proton,
}

/// A conference stored on the event: requested (to be provisioned by the
/// provider on sync) or live with a join URL.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum EventConference {
    Requested {
        provider: ConferenceProvider,
    },
    Live {
        provider: ConferenceProvider,
        url: String,
    },
}

impl EventConference {
    pub fn provider(&self) -> ConferenceProvider {
        match self {
            Self::Requested { provider } | Self::Live { provider, .. } => *provider,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Calendar {
    pub slug: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub account: Option<String>,
    #[serde(default)]
    pub read_only: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CalendarEvent {
    /// `{uid}__{recurrence_id}`; unique only within one calendar (see `key`).
    pub id: String,
    #[serde(default)]
    pub recurring_event_id: Option<String>,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    pub start: EventTime,
    pub end: EventTime,
    #[serde(default)]
    pub status: EventStatus,
    #[serde(default)]
    pub recurrence: Option<Recurrence>,
    #[serde(default)]
    pub master_recurrence: Option<Recurrence>,
    #[serde(default)]
    pub reminders: Vec<i32>,
    #[serde(default)]
    pub organizer: Option<EventAttendee>,
    #[serde(default)]
    pub attendees: Vec<EventAttendee>,
    #[serde(default)]
    pub conference: Option<EventConference>,
    pub calendar_slug: String,
    #[serde(default)]
    pub color: Option<String>,
    /// RFC 3339 timestamp of the last modification, for cheap change detection.
    #[serde(default)]
    pub updated: Option<String>,
    /// Viewer-zone projections of `start`/`end`; see the module docs.
    #[serde(skip)]
    pub date_info: EventDateInfo,
}

/// App-wide identity of an event: `{calendar_slug}::{id}`. The id alone repeats
/// when one series is subscribed through two calendars.
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct EventKey(pub String);

impl CalendarEvent {
    pub fn key(&self) -> EventKey {
        event_key(&self.calendar_slug, &self.id)
    }

    /// Recompute `date_info` for `viewer`.
    pub fn refresh_date_info(&mut self, viewer: Tz) {
        self.date_info = EventDateInfo::compute(&self.start, &self.end, viewer);
    }

    /// `refresh_date_info`, by value.
    pub fn with_viewer(mut self, viewer: Tz) -> Self {
        self.refresh_date_info(viewer);
        self
    }

    /// A copy with new start/end and a matching `date_info`.
    pub fn with_dates(&self, start: EventTime, end: EventTime, viewer: Tz) -> Self {
        let mut event = self.clone();
        event.set_dates(start, end, viewer);
        event
    }

    pub fn set_dates(&mut self, start: EventTime, end: EventTime, viewer: Tz) {
        self.start = start;
        self.end = end;
        self.refresh_date_info(viewer);
    }

    /// All-day events always sit in the all-day lane; timed events only when they
    /// cross a day boundary.
    pub fn is_spanning(&self) -> bool {
        self.start.is_all_day() || self.date_info.last_day - self.date_info.first_day >= 1
    }

    fn calendar<'a>(&self, calendars: &'a [Calendar]) -> Option<&'a Calendar> {
        calendars.iter().find(|c| c.slug == self.calendar_slug)
    }

    /// The account owner's RSVP, when the event's calendar has an account and the
    /// owner is an attendee.
    pub fn user_response_status(&self, calendars: &[Calendar]) -> Option<ResponseStatus> {
        let account = self.calendar(calendars)?.account.as_deref()?;
        self.attendees
            .iter()
            .find(|a| a.email.eq_ignore_ascii_case(account))
            .and_then(|a| a.response_status)
    }

    pub fn is_user_organizer(&self, calendars: &[Calendar]) -> bool {
        let Some(organizer) = &self.organizer else {
            return true;
        };
        if self.attendees.is_empty() {
            return true;
        }
        match self.calendar(calendars).and_then(|c| c.account.as_deref()) {
            Some(account) => organizer.email.eq_ignore_ascii_case(account),
            None => true,
        }
    }

    pub fn is_readonly(&self, calendars: &[Calendar]) -> bool {
        if self
            .calendar(calendars)
            .is_some_and(|c| c.read_only == Some(true))
        {
            return true;
        }
        !self.is_user_organizer(calendars)
    }
}

pub fn event_key(calendar_slug: &str, id: &str) -> EventKey {
    EventKey(format!("{calendar_slug}::{id}"))
}

/// Replace an optimistic create with the event the backend returned. A reload
/// may already have dropped the optimistic row (append the created event) or
/// fetched the created event (drop the stale optimistic row).
pub fn reconcile_optimistic_create(
    events: &mut Vec<CalendarEvent>,
    optimistic: &EventKey,
    created: CalendarEvent,
) {
    let optimistic_index = events.iter().position(|e| &e.key() == optimistic);
    let created_key = created.key();
    let created_index = events.iter().position(|e| e.key() == created_key);

    match (created_index, optimistic_index) {
        (Some(created), Some(optimistic)) if created != optimistic => {
            events.remove(optimistic);
        }
        (Some(_), _) => {}
        (None, None) => events.push(created),
        (None, Some(optimistic)) => events[optimistic] = created,
    }
}

/// Remove an optimistic create after `create_event` fails.
pub fn rollback_optimistic_create(events: &mut Vec<CalendarEvent>, optimistic: &EventKey) {
    if let Some(index) = events.iter().position(|e| &e.key() == optimistic) {
        events.remove(index);
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MergePosition {
    Append,
    Prepend,
}

/// Merge freshly loaded events, skipping keys already present. Returns whether
/// anything was added.
pub fn merge_events(
    events: &mut Vec<CalendarEvent>,
    incoming: Vec<CalendarEvent>,
    position: MergePosition,
) -> bool {
    let existing: HashSet<EventKey> = events.iter().map(CalendarEvent::key).collect();
    let fresh: Vec<CalendarEvent> = incoming
        .into_iter()
        .filter(|e| !existing.contains(&e.key()))
        .collect();
    if fresh.is_empty() {
        return false;
    }
    match position {
        MergePosition::Append => events.extend(fresh),
        MergePosition::Prepend => {
            events.splice(0..0, fresh);
        }
    }
    true
}

/// A `[start, end)` range of calendar days.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct DateRange {
    pub start: NaiveDate,
    pub end: NaiveDate,
}

/// Months loaded on each side of the active month at startup.
pub const MONTHS_TO_LOAD: i32 = 2;

/// The initial range loaded around `date`: two months before its month to two
/// months after.
pub fn start_range_for_date(date: NaiveDate) -> DateRange {
    DateRange {
        start: add_months_to_month_start(date, -MONTHS_TO_LOAD),
        end: add_months_to_month_start(date, MONTHS_TO_LOAD + 1),
    }
}
