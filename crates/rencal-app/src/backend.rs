//! The `Backend` global: the shared `rencal_core::state::AppState`, plus the
//! caldir reads the views need, run off the main thread and converted to the
//! app's event model (`rencal_time`). This replaces the old `src/lib/api/`
//! facade: views never call `rencal_core::caldir` themselves; they go through
//! `EventStore` (and the few one-shot reads here).
//!
//! Tests run without a backend (`Backend::try_state` is `None`), so the stores
//! stay empty instead of touching the user's caldir.

use std::sync::Arc;

use chrono::{NaiveDate, SecondsFormat, Utc};
use gpui_kit::{App, Global};
use rencal_core::caldir;
use rencal_core::error::CoreResult;
use rencal_core::state::AppState;
use rencal_time::event::DateRange;
use rencal_time::{Calendar, CalendarEvent, Tz, zoned};
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
