use std::sync::Arc;

use caldir_core::availability::format_free_windows;
use chrono::{DateTime, Utc};

use super::availability::{Resolved, now, resolve};
use super::availability_draft::parse_tz;
use super::types::PreviewSource;
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};
use crate::state::AppState;

/// Shareable text, formatted as `caldir free <ref> [--tz]` prints it: an
/// availability's free windows over its booking range, with busy time from
/// `calendar_slugs`, or picked ranges as they are.
pub(super) async fn handler(
    state: Arc<AppState>,
    source: PreviewSource,
    calendar_slugs: Vec<String>,
    tzid: Option<String>,
) -> TauResult<String> {
    tokio::task::spawn_blocking(move || text(&state, source, &calendar_slugs, tzid, now()))
        .await
        .map_err(|err| RpcError::new(RpcErrorKind::Internal, err.to_string()))?
}

fn text(
    state: &AppState,
    source: PreviewSource,
    calendar_slugs: &[String],
    tzid: Option<String>,
    now: DateTime<Utc>,
) -> TauResult<String> {
    let resolved = resolve(&state.caldir(), source)?;
    let tz = match tzid {
        Some(tzid) => parse_tz(&tzid)?,
        None => resolved.tz(),
    };

    Ok(match resolved {
        Resolved::Availability { availability, name } => {
            let windows = match availability.rules.range(now).is_empty() {
                true => Vec::new(),
                false => {
                    let busy_range = availability.rules.busy_range(now);
                    let busy = state.busy_intervals(calendar_slugs, busy_range, tz)?;
                    availability.free_windows(&busy, now)
                }
            };
            format!("{name}:\n{}", format_free_windows(&windows, tz))
        }
        Resolved::Ranges { ranges, .. } => format_free_windows(&ranges, tz),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::caldir::availability_draft::to_span;
    use crate::state::ProviderDirs;
    use caldir_core::{CaldirConfig, Interval};
    use chrono::TimeZone;

    fn state() -> (tempfile::TempDir, AppState) {
        let tmp = tempfile::tempdir().unwrap();
        let mut config = CaldirConfig::default();
        config.set_data_dir(tmp.path().join("calendars"));
        let config_path = tmp.path().join("config.toml");
        config.write(&config_path).unwrap();
        let state = AppState::load_from(config_path, ProviderDirs::default()).unwrap();
        (tmp, state)
    }

    fn utc(d: u32, h: u32, m: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 11, d, h, m, 0).unwrap()
    }

    #[test]
    fn ranges_format_in_the_requested_zone_without_a_header() {
        let (_tmp, state) = state();
        let source = PreviewSource::Ranges {
            ranges: vec![
                to_span(&Interval::new(utc(3, 9, 0), utc(3, 10, 0))),
                to_span(&Interval::new(utc(5, 13, 0), utc(5, 14, 0))),
            ],
            tzid: "Europe/Stockholm".into(),
        };

        let text = text(
            &state,
            source,
            &[],
            Some("America/New_York".into()),
            utc(1, 0, 0),
        )
        .unwrap();

        assert_eq!(
            text,
            "Tue 3 Nov: 04:00–05:00\nThu 5 Nov: 08:00–09:00\n(America/New_York)"
        );
    }

    #[test]
    fn an_availability_is_headed_by_its_name() {
        let (_tmp, state) = state();
        let dir = state.caldir().availability_dir_for_new(None).unwrap();
        let mut availability = caldir_core::availability::Availability::new(Vec::new());
        availability.summary = Some("Calls".into());
        let file = dir.create(availability).unwrap();
        let source = PreviewSource::Saved {
            id: file.qualified_reference(),
        };

        let text = text(&state, source, &[], Some("UTC".into()), utc(1, 0, 0)).unwrap();

        assert_eq!(text, "Calls:\nNo free times (UTC)");
    }
}
