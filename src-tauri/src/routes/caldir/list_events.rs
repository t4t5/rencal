use super::helpers::{event_time_sort_key, is_visible};
use super::types::{CalendarEvent, RpcRecurrence, core_recurrence_to_rpc};
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};
use crate::state::AppState;
use caldir_core::expand_in_range;
use chrono::{DateTime, Utc};
use std::collections::HashMap;

pub(super) fn handler(
    state: &AppState,
    calendar_slugs: Vec<String>,
    start: String,
    end: String,
) -> TauResult<Vec<CalendarEvent>> {
    let range_start: DateTime<Utc> = start.parse().map_err(|e: chrono::ParseError| {
        RpcError::new(
            RpcErrorKind::InvalidInput,
            format!("Invalid event range: {e}"),
        )
    })?;
    let range_end: DateTime<Utc> = end.parse().map_err(|e: chrono::ParseError| {
        RpcError::new(
            RpcErrorKind::InvalidInput,
            format!("Invalid event range: {e}"),
        )
    })?;

    if range_start >= range_end {
        return Err(RpcError::new(
            RpcErrorKind::InvalidInput,
            "Event range end must be after start",
        ));
    }

    let mut events = Vec::new();

    for slug in &calendar_slugs {
        let parsed = state.events(slug)?;
        let master_recurrences: HashMap<String, RpcRecurrence> = parsed
            .iter()
            .filter_map(|e| {
                e.recurrence
                    .as_ref()
                    .map(|r| (e.uid.as_str().to_string(), core_recurrence_to_rpc(r)))
            })
            .collect();

        for event in expand_in_range(parsed.iter().cloned(), range_start, range_end) {
            if !is_visible(&event) {
                continue;
            }
            let master_rec = master_recurrences.get(event.uid.as_str()).cloned();
            events.push(CalendarEvent::from_event(&event, slug, master_rec));
        }
    }

    events.sort_by_key(|a| event_time_sort_key(&a.start));
    Ok(events)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_ranges_return_input_errors() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::load_from(dir.path().join("config.toml"), None).unwrap();
        for (start, end) in [
            ("invalid", "2026-09-19T00:00:00Z"),
            ("2026-09-18T00:00:00Z", "invalid"),
            ("2026-09-19T00:00:00Z", "2026-09-18T00:00:00Z"),
            ("2026-09-18T00:00:00Z", "2026-09-18T00:00:00Z"),
        ] {
            let error = handler(&state, vec![], start.into(), end.into())
                .err()
                .unwrap();
            assert_eq!(error.kind, RpcErrorKind::InvalidInput);
            assert!(error.message.to_lowercase().contains("range"));
        }
        assert!(
            handler(
                &state,
                vec![],
                "2026-09-18T00:00:00Z".into(),
                "2026-09-19T00:00:00Z".into()
            )
            .unwrap()
            .is_empty()
        );
    }
}
