use std::sync::Arc;

use caldir_core::{Caldir, Interval};
use chrono::{DateTime, Duration, Utc};

use super::availability::{Resolved, intersect, merge, now, resolve};
use super::availability_draft::{from_span, to_span};
use super::types::{AvailabilityPreview, PreviewSource, Span};
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};
use crate::state::AppState;

/// Busy outside the visible range only matters through windows that cross its
/// edges; a day either side covers them.
const EDGE_MARGIN: Duration = Duration::days(1);

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
    tokio::task::spawn_blocking(move || {
        preview(&state.caldir(), source, &calendar_slugs, range, now())
    })
    .await
    .map_err(|err| RpcError::new(RpcErrorKind::Internal, err.to_string()))?
}

fn preview(
    caldir: &Caldir,
    source: PreviewSource,
    calendar_slugs: &[String],
    range: Interval,
    now: DateTime<Utc>,
) -> TauResult<AvailabilityPreview> {
    let resolved = resolve(caldir, source)?;
    let tz = resolved.tz();

    let (available, busy, free) = match resolved {
        Resolved::Availability { availability, .. } => {
            let rules = availability.rules;
            // Hours before notice can't be booked, so they aren't drawn.
            let bookable_from = rules.range(now).start.max(range.start);
            let available = if bookable_from < range.end {
                availability.available_intervals(bookable_from, range.end)
            } else {
                Vec::new()
            };
            let free = match rules.range(now).intersect(&range) {
                None => Vec::new(),
                Some(_) => {
                    let wanted = Interval::new(
                        range.start - rules.buffer_after - EDGE_MARGIN,
                        range.end + rules.buffer_before + EDGE_MARGIN,
                    );
                    let busy_range = rules.busy_range(now);
                    let busy = match busy_range.intersect(&wanted) {
                        Some(fetch) => {
                            caldir.busy_intervals_in(calendar_slugs, fetch.start, fetch.end, tz)?
                        }
                        None => Vec::new(),
                    };
                    intersect(&availability.free_windows(&busy, now), &[range])
                }
            };

            let busy = caldir.busy_intervals_in(
                calendar_slugs,
                range.start - rules.buffer_after,
                range.end + rules.buffer_before,
                tz,
            )?;
            let padded = merge(
                busy.iter()
                    .map(|b| {
                        Interval::new(b.start - rules.buffer_before, b.end + rules.buffer_after)
                    })
                    .collect(),
            );
            (available.clone(), intersect(&available, &padded), free)
        }
        Resolved::Ranges { ranges, tz } => {
            let picked = intersect(&ranges, &[range]);
            let busy = caldir.busy_intervals_in(calendar_slugs, range.start, range.end, tz)?;
            (picked.clone(), intersect(&picked, &busy), picked)
        }
    };

    let spans = |intervals: &[Interval]| intervals.iter().map(to_span).collect();
    Ok(AvailabilityPreview {
        available: spans(&available),
        busy: spans(&busy),
        free: spans(&free),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::caldir::types::{AvailabilityDraft, DayHours, TimeRange, Weekday};
    use caldir_core::{
        Attendee, CaldirConfig, Calendar, CalendarConfig, Event, EventTime, ParticipationStatus,
    };
    use chrono::{NaiveDate, TimeZone};

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
        caldir: Caldir,
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
            caldir: Caldir::load_from(&config_path).unwrap(),
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
            buffer_before_minutes: 0,
            buffer_after_minutes: 15,
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
    fn buffers_widen_busy_and_declined_or_read_only_events_dont_block() {
        let fixture = fixture();
        let now = utc(1, 23, 0);

        let preview = preview(
            &fixture.caldir,
            draft(weekdays_9_to_17()),
            &all(),
            week(),
            now,
        )
        .unwrap();

        assert_eq!(
            preview.available,
            [
                span(utc(2, 8, 0), utc(2, 16, 0)),
                span(utc(3, 8, 0), utc(3, 16, 0))
            ]
        );
        assert_eq!(preview.busy, [span(utc(2, 9, 0), utc(2, 10, 15))]);
        // The one-day horizon ends at Monday midnight: Tuesday is out.
        assert_eq!(
            preview.free,
            [
                span(utc(2, 8, 0), utc(2, 9, 0)),
                span(utc(2, 10, 15), utc(2, 16, 0))
            ]
        );
    }

    #[test]
    fn nothing_is_free_before_notice() {
        let fixture = fixture();
        let mut rules = weekdays_9_to_17();
        rules.notice_minutes = 4 * 60;
        // Mon 09:30 Stockholm.
        let now = utc(2, 8, 30);

        let preview = preview(&fixture.caldir, draft(rules), &all(), week(), now).unwrap();

        assert_eq!(preview.available[0], span(utc(2, 12, 30), utc(2, 16, 0)));
        assert_eq!(preview.free[0], span(utc(2, 12, 30), utc(2, 16, 0)));
    }

    #[test]
    fn a_read_only_calendar_counting_as_busy_blocks() {
        let fixture = fixture();
        let feed = fixture.caldir.calendar("feed").unwrap();
        let mut config = feed.config().cloned().unwrap();
        config.set_busy(Some(true));
        config.write(&feed.config_path()).unwrap();

        let preview = preview(
            &fixture.caldir,
            draft(weekdays_9_to_17()),
            &all(),
            week(),
            utc(1, 23, 0),
        )
        .unwrap();

        assert_eq!(
            preview.busy,
            [
                span(utc(2, 9, 0), utc(2, 10, 15)),
                span(utc(2, 11, 0), utc(2, 12, 15))
            ]
        );
    }

    #[test]
    fn only_the_given_calendars_block() {
        let fixture = fixture();

        let preview = preview(
            &fixture.caldir,
            draft(weekdays_9_to_17()),
            &["feed".to_string()],
            week(),
            utc(1, 23, 0),
        )
        .unwrap();

        assert_eq!(preview.busy, []);
    }

    #[test]
    fn ranges_are_free_as_picked_and_flag_busy_overlap() {
        let fixture = fixture();
        let source = PreviewSource::Ranges {
            ranges: vec![
                span(utc(2, 9, 30), utc(2, 10, 30)),
                span(utc(2, 10, 0), utc(2, 11, 30)),
            ],
            tzid: "Europe/Stockholm".into(),
        };

        let preview = preview(&fixture.caldir, source, &all(), week(), utc(1, 23, 0)).unwrap();

        assert_eq!(preview.free, [span(utc(2, 9, 30), utc(2, 11, 30))]);
        assert_eq!(preview.busy, [span(utc(2, 9, 30), utc(2, 10, 0))]);
    }
}
