use std::sync::Arc;

use caldir_core::Interval;

use super::availability::{Resolved, intersect, resolve};
use super::availability_draft::{from_span, to_span};
use super::types::{AvailabilityPreview, PreviewSource, Span};
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};
use crate::state::AppState;

/// What the grid draws for `[from, to)`, with busy time from `calendar_slugs`.
pub(super) async fn handler(
    state: Arc<AppState>,
    source: PreviewSource,
    calendar_slugs: Vec<String>,
    from: String,
    to: String,
) -> TauResult<AvailabilityPreview> {
    let range = from_span(&Span {
        start: from,
        end: to,
    })?;
    tokio::task::spawn_blocking(move || preview(&state, source, &calendar_slugs, range))
        .await
        .map_err(|err| RpcError::new(RpcErrorKind::Internal, err.to_string()))?
}

fn preview(
    state: &AppState,
    source: PreviewSource,
    calendar_slugs: &[String],
    range: Interval,
) -> TauResult<AvailabilityPreview> {
    let resolved = resolve(&state.caldir(), source)?;
    let tz = resolved.tz();

    let available = match resolved {
        Resolved::Availability { availability, .. } => {
            availability.available_intervals(range.start, range.end)
        }
        Resolved::Ranges { ranges, .. } => intersect(&ranges, &[range]),
    };
    let busy = state.busy_intervals(calendar_slugs, range, tz)?;

    let spans = |intervals: &[Interval]| intervals.iter().map(to_span).collect();
    Ok(AvailabilityPreview {
        available: spans(&available),
        busy: spans(&intersect(&available, &busy)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::caldir::types::{AvailabilityDraft, DayHours, TimeRange, Weekday};
    use crate::state::ProviderDirs;
    use caldir_core::{
        Attendee, CaldirConfig, Calendar, CalendarConfig, Event, EventTime, ParticipationStatus,
    };
    use chrono::{DateTime, NaiveDate, TimeZone, Utc};

    fn stockholm(d: u32, h: u32, m: u32) -> EventTime {
        EventTime::DateTimeZoned {
            datetime: NaiveDate::from_ymd_opt(2026, 11, d)
                .unwrap()
                .and_hms_opt(h, m, 0)
                .unwrap(),
            tzid: "Europe/Stockholm".to_string(),
        }
    }

    // Stockholm is UTC+1 in November.
    fn utc(d: u32, h: u32, m: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 11, d, h, m, 0).unwrap()
    }

    fn span(start: DateTime<Utc>, end: DateTime<Utc>) -> Span {
        to_span(&Interval::new(start, end))
    }

    fn event(summary: &str, start: EventTime, end: EventTime) -> Event {
        let mut event = Event::new(summary, start);
        event.end = Some(end);
        event
    }

    struct Fixture {
        _tmp: tempfile::TempDir,
        state: AppState,
    }

    /// `work` (Google, me@example.com) and a read-only `feed`.
    fn fixture() -> Fixture {
        let tmp = tempfile::tempdir().unwrap();
        let data_dir = tmp.path().join("calendars");
        let mut config = CaldirConfig::default();
        config.set_data_dir(data_dir.clone());
        let config_path = tmp.path().join("config.toml");
        config.write(&config_path).unwrap();

        let work = Calendar::create(&data_dir.join("work"), None).unwrap();
        std::fs::write(
            work.config_path(),
            "[remote]\nprovider = \"google\"\ngoogle_account = \"me@example.com\"\n",
        )
        .unwrap();
        let work = Calendar::load(work.path()).unwrap();
        // Mon 2 Nov: a meeting, a declined invite.
        work.create_event(event("Meeting", stockholm(2, 10, 0), stockholm(2, 11, 0)))
            .unwrap();
        let mut declined = event("Declined", stockholm(2, 14, 0), stockholm(2, 15, 0));
        let mut me = Attendee::new("me@example.com");
        me.status = Some(ParticipationStatus::Declined);
        declined.attendees.push(me);
        work.create_event(declined).unwrap();

        let feed = Calendar::create(
            &data_dir.join("feed"),
            Some(CalendarConfig::new(None, None, Some(true), None)),
        )
        .unwrap();
        feed.create_event(event("Match", stockholm(2, 12, 0), stockholm(2, 13, 0)))
            .unwrap();

        Fixture {
            state: AppState::load_from(config_path, ProviderDirs::default()).unwrap(),
            _tmp: tmp,
        }
    }

    fn weekdays_9_to_17() -> AvailabilityDraft {
        AvailabilityDraft {
            name: "Calls".into(),
            tzid: "Europe/Stockholm".into(),
            hours: [Weekday::Mo, Weekday::Tu]
                .into_iter()
                .map(|day| DayHours {
                    day,
                    ranges: vec![TimeRange {
                        start: "09:00".into(),
                        end: "17:00".into(),
                    }],
                })
                .collect(),
            duration_minutes: 30,
            notice_minutes: 0,
            horizon_days: 1,
        }
    }

    fn draft(draft: AvailabilityDraft) -> PreviewSource {
        PreviewSource::Draft { id: None, draft }
    }

    fn all() -> Vec<String> {
        vec!["work".to_string(), "feed".to_string()]
    }

    // Mon 2 → Wed 4 Nov, Stockholm.
    fn week() -> Interval {
        Interval::new(utc(1, 23, 0), utc(4, 23, 0))
    }

    #[test]
    fn declined_or_read_only_events_dont_block() {
        let fixture = fixture();

        let preview = preview(&fixture.state, draft(weekdays_9_to_17()), &all(), week()).unwrap();

        assert_eq!(
            preview.available,
            [
                span(utc(2, 8, 0), utc(2, 16, 0)),
                span(utc(3, 8, 0), utc(3, 16, 0))
            ]
        );
        assert_eq!(preview.busy, [span(utc(2, 9, 0), utc(2, 10, 0))]);
    }

    #[test]
    fn a_read_only_calendar_counting_as_busy_blocks() {
        let fixture = fixture();
        let feed = fixture.state.caldir().calendar("feed").unwrap();
        let mut config = feed.config().cloned().unwrap();
        config.set_busy(Some(true));
        config.write(&feed.config_path()).unwrap();

        let preview = preview(&fixture.state, draft(weekdays_9_to_17()), &all(), week()).unwrap();

        assert_eq!(
            preview.busy,
            [
                span(utc(2, 9, 0), utc(2, 10, 0)),
                span(utc(2, 11, 0), utc(2, 12, 0))
            ]
        );
    }

    #[test]
    fn only_the_given_calendars_block() {
        let fixture = fixture();

        let preview = preview(
            &fixture.state,
            draft(weekdays_9_to_17()),
            &["feed".to_string()],
            week(),
        )
        .unwrap();

        assert_eq!(preview.busy, []);
    }

    #[test]
    fn ranges_are_available_as_picked_and_flag_busy_overlap() {
        let fixture = fixture();
        let source = PreviewSource::Ranges {
            ranges: vec![
                span(utc(2, 9, 30), utc(2, 10, 30)),
                span(utc(2, 10, 0), utc(2, 11, 30)),
            ],
            tzid: "Europe/Stockholm".into(),
        };

        let preview = preview(&fixture.state, source, &all(), week()).unwrap();

        assert_eq!(preview.available, [span(utc(2, 9, 30), utc(2, 11, 30))]);
        assert_eq!(preview.busy, [span(utc(2, 9, 30), utc(2, 10, 0))]);
    }
}
