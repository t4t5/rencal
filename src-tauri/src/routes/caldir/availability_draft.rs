//! Maps between a core `Availability` and the editor's `AvailabilityDraft`.
//! Apply replaces only the summary, blocks and booking rules; everything else
//! in the file (UID, overrides, `X-*`, description, URL, organizer, window)
//! is left as loaded.

use caldir_core::Interval;
use caldir_core::availability::{Availability, BookingRules, WeeklyHours};
use chrono::{DateTime, Duration, NaiveTime, SecondsFormat, Timelike, Utc};
use chrono_tz::Tz;

use super::types::{AvailabilityDraft, DayHours, Span, TimeRange, Weekday};
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};

const WEEKDAYS: [(Weekday, chrono::Weekday); 7] = [
    (Weekday::Mo, chrono::Weekday::Mon),
    (Weekday::Tu, chrono::Weekday::Tue),
    (Weekday::We, chrono::Weekday::Wed),
    (Weekday::Th, chrono::Weekday::Thu),
    (Weekday::Fr, chrono::Weekday::Fri),
    (Weekday::Sa, chrono::Weekday::Sat),
    (Weekday::Su, chrono::Weekday::Sun),
];

pub(super) struct Decomposed {
    pub draft: AvailabilityDraft,
    pub hours_editable: bool,
}

/// `fallback_tzid` names the zone when the blocks don't carry one.
pub(super) fn decompose(availability: &Availability, fallback_tzid: &str) -> Decomposed {
    let weekly = editable_hours(availability);
    let hours_editable = weekly.is_some();
    let tzid = availability
        .tzid()
        .map_or_else(|| fallback_tzid.to_string(), str::to_string);
    let hours = weekly.as_ref().map(hours_to_dto).unwrap_or_default();
    let rules = &availability.rules;

    Decomposed {
        draft: AvailabilityDraft {
            name: availability.summary.clone().unwrap_or_default(),
            tzid,
            hours,
            duration_minutes: minutes(rules.duration),
            notice_minutes: minutes(rules.notice),
            horizon_days: days_ceil(rules.horizon),
        },
        hours_editable,
    }
}

/// Apply `draft` onto `base`.
pub(super) fn apply(base: &Availability, draft: &AvailabilityDraft) -> TauResult<Availability> {
    let original = decompose(base, &draft.tzid);
    let rules = validate_rules(draft)?;
    let mut availability = base.clone();

    let name = draft.name.trim();
    availability.summary = (!name.is_empty()).then(|| name.to_string());
    availability.rules = keep_unchanged_rules(&base.rules, &original.draft, draft, rules);

    if original.hours_editable {
        let tz = parse_tz(&draft.tzid)?;
        let hours = parse_hours(&draft.hours)?;
        let unchanged =
            draft.tzid == original.draft.tzid && base.weekly_hours().as_ref() == Some(&hours);
        if !unchanged {
            availability.set_weekly_hours(&hours, tz);
        }
    }

    Ok(availability)
}

/// Booking rules from the draft, rejecting values core can't use.
fn validate_rules(draft: &AvailabilityDraft) -> TauResult<BookingRules> {
    if draft.duration_minutes == 0 {
        return Err(invalid("Duration must be at least one minute"));
    }
    if draft.horizon_days == 0 {
        return Err(invalid("Booking window must be at least one day"));
    }
    Ok(BookingRules {
        duration: Duration::minutes(draft.duration_minutes.into()),
        notice: Duration::minutes(draft.notice_minutes.into()),
        horizon: Duration::days(draft.horizon_days.into()),
    })
}

/// Rules the draft didn't change keep their exact file value, so a `PT36H`
/// horizon doesn't round to two days on an unrelated save.
fn keep_unchanged_rules(
    base: &BookingRules,
    original: &AvailabilityDraft,
    draft: &AvailabilityDraft,
    next: BookingRules,
) -> BookingRules {
    let pick = |same: bool, kept: Duration, changed: Duration| match same {
        true => kept,
        false => changed,
    };
    BookingRules {
        duration: pick(
            draft.duration_minutes == original.duration_minutes,
            base.duration,
            next.duration,
        ),
        notice: pick(
            draft.notice_minutes == original.notice_minutes,
            base.notice,
            next.notice,
        ),
        horizon: pick(
            draft.horizon_days == original.horizon_days,
            base.horizon,
            next.horizon,
        ),
    }
}

/// Core's weekly hours, when the editor can show them: it edits whole minutes.
fn editable_hours(availability: &Availability) -> Option<WeeklyHours> {
    let hours = availability.weekly_hours()?;
    let whole_minutes = |time: &NaiveTime| time.second() == 0 && time.nanosecond() == 0;
    WEEKDAYS
        .iter()
        .flat_map(|(_, day)| hours.ranges(*day))
        .all(|(start, end)| whole_minutes(start) && whole_minutes(end))
        .then_some(hours)
}

/// Every weekday in Monday-first order, empty when unavailable.
fn hours_to_dto(hours: &WeeklyHours) -> Vec<DayHours> {
    WEEKDAYS
        .iter()
        .map(|(day, weekday)| DayHours {
            day: *day,
            ranges: hours
                .ranges(*weekday)
                .iter()
                .map(|(start, end)| TimeRange {
                    start: format_time(*start),
                    end: format_time(*end),
                })
                .collect(),
        })
        .collect()
}

fn parse_hours(days: &[DayHours]) -> TauResult<WeeklyHours> {
    let mut hours = WeeklyHours::new();
    for day in days {
        for range in &day.ranges {
            let start = parse_time(&range.start)?;
            let end = parse_time(&range.end)?;
            if end <= start {
                return Err(invalid(format!(
                    "End time must be after start time ({} {}–{})",
                    day_label(day.day),
                    range.start,
                    range.end
                )));
            }
            hours.add(chrono_weekday(day.day), start, end);
        }
    }
    Ok(hours)
}

pub(super) fn parse_tz(tzid: &str) -> TauResult<Tz> {
    tzid.parse()
        .map_err(|_| invalid(format!("Unknown timezone \"{tzid}\"")))
}

fn parse_time(value: &str) -> TauResult<NaiveTime> {
    NaiveTime::parse_from_str(value, "%H:%M")
        .map_err(|_| invalid(format!("Invalid time \"{value}\", expected HH:MM")))
}

fn format_time(time: NaiveTime) -> String {
    time.format("%H:%M").to_string()
}

fn day_label(day: Weekday) -> &'static str {
    match day {
        Weekday::Mo => "Mon",
        Weekday::Tu => "Tue",
        Weekday::We => "Wed",
        Weekday::Th => "Thu",
        Weekday::Fr => "Fri",
        Weekday::Sa => "Sat",
        Weekday::Su => "Sun",
    }
}

fn chrono_weekday(day: Weekday) -> chrono::Weekday {
    WEEKDAYS
        .iter()
        .find(|(d, _)| *d == day)
        .map(|(_, weekday)| *weekday)
        .expect("every weekday is listed")
}

fn minutes(duration: Duration) -> u32 {
    duration.num_minutes().clamp(0, u32::MAX.into()) as u32
}

fn days_ceil(duration: Duration) -> u32 {
    let minutes = duration.num_minutes().max(0);
    ((minutes + 24 * 60 - 1) / (24 * 60)).min(u32::MAX.into()) as u32
}

fn invalid(message: impl Into<String>) -> RpcError {
    RpcError::new(RpcErrorKind::InvalidInput, message)
}

pub(super) fn to_span(interval: &Interval) -> Span {
    let rfc3339 = |dt: DateTime<Utc>| dt.to_rfc3339_opts(SecondsFormat::Secs, true);
    Span {
        start: rfc3339(interval.start),
        end: rfc3339(interval.end),
    }
}

pub(super) fn from_span(span: &Span) -> TauResult<Interval> {
    let parse = |value: &str| {
        DateTime::parse_from_rfc3339(value)
            .map(|dt| dt.with_timezone(&Utc))
            .map_err(|_| invalid(format!("Invalid instant \"{value}\"")))
    };
    Ok(Interval::new(parse(&span.start)?, parse(&span.end)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use caldir_core::availability::{AvailabilityOverride, AvailableBlock};
    use caldir_core::{EventTime, Recurrence};
    use chrono::NaiveDate;

    const STOCKHOLM: &str = "Europe/Stockholm";

    fn time(h: u32, m: u32) -> NaiveTime {
        NaiveTime::from_hms_opt(h, m, 0).unwrap()
    }

    fn range(start: &str, end: &str) -> TimeRange {
        TimeRange {
            start: start.into(),
            end: end.into(),
        }
    }

    fn day(day: Weekday, ranges: &[(&str, &str)]) -> DayHours {
        DayHours {
            day,
            ranges: ranges.iter().map(|(s, e)| range(s, e)).collect(),
        }
    }

    fn weekdays(ranges: &[(&str, &str)]) -> Vec<DayHours> {
        WEEKDAYS
            .iter()
            .map(|(d, _)| match d {
                Weekday::Sa | Weekday::Su => day(*d, &[]),
                _ => day(*d, ranges),
            })
            .collect()
    }

    fn draft(hours: Vec<DayHours>) -> AvailabilityDraft {
        AvailabilityDraft {
            name: "Calls".into(),
            tzid: STOCKHOLM.into(),
            hours,
            duration_minutes: 30,
            notice_minutes: 0,
            horizon_days: 14,
        }
    }

    fn weekly(days: &[chrono::Weekday], start: NaiveTime, end: NaiveTime) -> AvailableBlock {
        AvailableBlock::weekly(days, start, end, chrono_tz::Europe::Stockholm).unwrap()
    }

    fn new_from(draft: &AvailabilityDraft) -> Availability {
        apply(&Availability::new(Vec::new()), draft).unwrap()
    }

    #[test]
    fn matches_what_the_cli_writes_for_the_same_hours() {
        let availability = new_from(&draft(weekdays(&[("09:00", "17:00")])));
        let cli = weekly(
            &[
                chrono::Weekday::Mon,
                chrono::Weekday::Tue,
                chrono::Weekday::Wed,
                chrono::Weekday::Thu,
                chrono::Weekday::Fri,
            ],
            time(9, 0),
            time(17, 0),
        );

        assert_eq!(availability.blocks.len(), 1);
        assert_eq!(availability.blocks[0].start, cli.start);
        assert_eq!(availability.blocks[0].end, cli.end);
        assert_eq!(availability.blocks[0].recurrence, cli.recurrence);
        assert_eq!(availability.summary.as_deref(), Some("Calls"));
        assert_eq!(availability.rules, BookingRules::default());
    }

    #[test]
    fn decompose_round_trips_a_draft() {
        let mut hours = weekdays(&[("09:00", "12:00"), ("13:00", "17:00")]);
        hours[5] = day(Weekday::Sa, &[("10:00", "11:30")]);
        let mut original = draft(hours);
        original.notice_minutes = 24 * 60;
        original.horizon_days = 60;

        let decomposed = decompose(&new_from(&original), "UTC");

        assert!(decomposed.hours_editable);
        assert_eq!(decomposed.draft, original);
    }

    #[test]
    fn overlapping_ranges_and_repeated_days_merge() {
        let hours = vec![
            day(Weekday::Mo, &[("13:00", "17:00"), ("09:00", "13:30")]),
            day(Weekday::Mo, &[("16:00", "18:00")]),
        ];

        let decomposed = decompose(&new_from(&draft(hours)), "UTC");

        assert_eq!(
            decomposed.draft.hours[0],
            day(Weekday::Mo, &[("09:00", "18:00")])
        );
    }

    #[test]
    fn unchanged_hours_keep_blocks_byte_identical() {
        // Two blocks the editor would have grouped into one.
        let mut base = Availability::new(vec![
            weekly(&[chrono::Weekday::Mon], time(9, 0), time(17, 0)),
            weekly(&[chrono::Weekday::Tue], time(9, 0), time(17, 0)),
        ]);
        base.summary = Some("Calls".into());
        let mut edited = decompose(&base, "UTC").draft;
        edited.name = "Renamed".into();

        let applied = apply(&base, &edited).unwrap();

        assert_eq!(applied.blocks, base.blocks);
        assert_eq!(applied.summary.as_deref(), Some("Renamed"));
        assert_eq!(applied.uid, base.uid);
    }

    #[test]
    fn changed_hours_reuse_blocks_that_still_match() {
        let base = new_from(&draft(weekdays(&[("09:00", "12:00"), ("13:00", "17:00")])));
        let mut edited = decompose(&base, "UTC").draft;
        for day in &mut edited.hours[..5] {
            day.ranges[1] = range("13:00", "16:00");
        }

        let applied = apply(&base, &edited).unwrap();

        assert_eq!(applied.blocks.len(), 2);
        assert_eq!(applied.blocks[0], base.blocks[0]);
        assert_ne!(applied.blocks[1].uid, base.blocks[1].uid);
    }

    #[test]
    fn timezone_change_keeps_wall_clock_hours() {
        let base = new_from(&draft(weekdays(&[("09:00", "17:00")])));
        let mut edited = decompose(&base, "UTC").draft;
        edited.tzid = "America/New_York".into();

        let applied = apply(&base, &edited).unwrap();
        let decomposed = decompose(&applied, "UTC");

        assert_eq!(applied.tzid(), Some("America/New_York"));
        assert_eq!(decomposed.draft.hours, weekdays(&[("09:00", "17:00")]));
        assert_ne!(applied.blocks[0].uid, base.blocks[0].uid);
    }

    #[test]
    fn overrides_and_other_properties_are_preserved() {
        let ics = "BEGIN:VCALENDAR\r\n\
VERSION:2.0\r\n\
PRODID:CALDIR\r\n\
BEGIN:VAVAILABILITY\r\n\
UID:8f3a2c@caldir\r\n\
DTSTAMP:20261028T090000Z\r\n\
SUMMARY:Calls\r\n\
DESCRIPTION:Book me\r\n\
URL:https://example.com\r\n\
ORGANIZER:mailto:me@example.com\r\n\
X-CALDIR-DURATION:PT45M\r\n\
X-HOMEGROWN:keep me\r\n\
BEGIN:AVAILABLE\r\n\
UID:8f3a2c-1@caldir\r\n\
DTSTAMP:20261028T090000Z\r\n\
DTSTART;TZID=Europe/Stockholm:20260105T090000\r\n\
DTEND;TZID=Europe/Stockholm:20260105T170000\r\n\
RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR\r\n\
END:AVAILABLE\r\n\
END:VAVAILABILITY\r\n\
BEGIN:VAVAILABILITY\r\n\
UID:8f3a2c-2@caldir\r\n\
DTSTAMP:20261028T090000Z\r\n\
DTSTART;TZID=Europe/Stockholm:20261221T000000\r\n\
DTEND;TZID=Europe/Stockholm:20270107T000000\r\n\
PRIORITY:1\r\n\
SUMMARY:Holidays\r\n\
END:VAVAILABILITY\r\n\
END:VCALENDAR\r\n";
        let base = Availability::from_ics_str(ics).unwrap();
        let mut edited = decompose(&base, "UTC").draft;
        assert_eq!(edited.duration_minutes, 45);
        edited.name = "Meetings".into();
        edited.hours[0].ranges[0] = range("10:00", "17:00");

        let applied = apply(&base, &edited).unwrap();

        assert_eq!(applied.overrides, base.overrides);
        assert_eq!(applied.x_properties, base.x_properties);
        assert_eq!(applied.description.as_deref(), Some("Book me"));
        assert_eq!(applied.url, base.url);
        assert_eq!(applied.organizer, base.organizer);
        assert_eq!(applied.uid, base.uid);
        let reparsed = Availability::from_ics_str(&applied.to_ics_string()).unwrap();
        assert_eq!(reparsed.overrides.len(), 1);
        assert_eq!(reparsed.summary.as_deref(), Some("Meetings"));
    }

    #[test]
    fn saving_unchanged_draft_is_byte_identical() {
        let base = new_from(&draft(weekdays(&[("09:00", "17:00")])));
        let edited = decompose(&base, "UTC").draft;

        let applied = apply(&base, &edited).unwrap();

        assert_eq!(applied.to_ics_string(), base.to_ics_string());
    }

    #[test]
    fn unchanged_rules_keep_their_exact_file_value() {
        let mut base = new_from(&draft(weekdays(&[("09:00", "17:00")])));
        base.rules.horizon = Duration::hours(36);
        let mut edited = decompose(&base, "UTC").draft;
        assert_eq!(edited.horizon_days, 2);
        edited.duration_minutes = 60;

        let applied = apply(&base, &edited).unwrap();

        assert_eq!(applied.rules.horizon, Duration::hours(36));
        assert_eq!(applied.rules.duration, Duration::minutes(60));
    }

    #[test]
    fn non_weekly_blocks_are_read_only_and_survive_a_save() {
        let at = |time: NaiveTime| EventTime::DateTimeZoned {
            datetime: NaiveDate::from_ymd_opt(2026, 10, 28)
                .unwrap()
                .and_time(time),
            tzid: STOCKHOLM.into(),
        };
        let one_off = AvailableBlock::new(at(time(9, 0)), at(time(10, 0)));
        let mut with_seconds = weekly(&[chrono::Weekday::Mon], time(9, 0), time(17, 0));
        with_seconds.start = at(NaiveTime::from_hms_opt(9, 0, 30).unwrap());
        with_seconds.end = at(time(17, 0));
        with_seconds.recurrence = Some(Recurrence::new("FREQ=WEEKLY;BYDAY=WE"));
        let mut daily = weekly(&[chrono::Weekday::Mon], time(9, 0), time(17, 0));
        daily.recurrence = Some(Recurrence::new("FREQ=DAILY"));
        let mut counted = weekly(&[chrono::Weekday::Mon], time(9, 0), time(17, 0));
        counted.recurrence = Some(Recurrence::new("FREQ=WEEKLY;BYDAY=MO;COUNT=3"));

        for blocks in [
            vec![one_off],
            vec![daily],
            vec![counted],
            vec![with_seconds],
        ] {
            let base = Availability::new(blocks);
            let decomposed = decompose(&base, "UTC");
            assert!(!decomposed.hours_editable);
            assert!(decomposed.draft.hours.is_empty());
            assert_eq!(decomposed.draft.tzid, STOCKHOLM);

            let mut edited = decomposed.draft;
            edited.name = "Renamed".into();
            let applied = apply(&base, &edited).unwrap();
            assert_eq!(applied.blocks, base.blocks);
        }
    }

    #[test]
    fn a_window_or_mixed_zones_make_hours_read_only() {
        let mut windowed = new_from(&draft(weekdays(&[("09:00", "17:00")])));
        windowed.start = windowed.blocks.first().map(|block| block.start.clone());
        assert!(!decompose(&windowed, "UTC").hours_editable);

        let mixed = Availability::new(vec![
            weekly(&[chrono::Weekday::Mon], time(9, 0), time(17, 0)),
            AvailableBlock::weekly(
                &[chrono::Weekday::Tue],
                time(9, 0),
                time(17, 0),
                chrono_tz::UTC,
            )
            .unwrap(),
        ]);
        assert!(!decompose(&mixed, "UTC").hours_editable);
    }

    #[test]
    fn override_count_is_not_the_editors_concern() {
        // Overrides never make the hours read-only.
        let mut base = new_from(&draft(weekdays(&[("09:00", "17:00")])));
        base.overrides.push(AvailabilityOverride {
            uid: "o@caldir".into(),
            dtstamp: base.dtstamp,
            summary: None,
            description: None,
            start: None,
            end: None,
            priority: 1,
            busy_type: None,
            last_modified: None,
            sequence: 0,
            blocks: Vec::new(),
            x_properties: Vec::new(),
        });
        assert!(decompose(&base, "UTC").hours_editable);
    }

    #[test]
    fn empty_availability_uses_the_fallback_zone() {
        let decomposed = decompose(&Availability::new(Vec::new()), "Asia/Tokyo");

        assert!(decomposed.hours_editable);
        assert_eq!(decomposed.draft.tzid, "Asia/Tokyo");
        assert!(
            decomposed
                .draft
                .hours
                .iter()
                .all(|day| day.ranges.is_empty())
        );
    }

    #[test]
    fn validation_errors() {
        let base = Availability::new(Vec::new());
        let cases = [
            draft(vec![day(Weekday::Mo, &[("17:00", "09:00")])]),
            AvailabilityDraft {
                tzid: "Mars/Olympus".into(),
                ..draft(Vec::new())
            },
            AvailabilityDraft {
                duration_minutes: 0,
                ..draft(Vec::new())
            },
            AvailabilityDraft {
                horizon_days: 0,
                ..draft(Vec::new())
            },
            draft(vec![day(Weekday::Mo, &[("9am", "17:00")])]),
        ];

        for case in cases {
            let error = apply(&base, &case).unwrap_err();
            assert_eq!(error.kind, RpcErrorKind::InvalidInput, "{error}");
        }
    }

    #[test]
    fn spans_round_trip_as_utc() {
        let interval = from_span(&Span {
            start: "2026-10-29T10:00:00+01:00".into(),
            end: "2026-10-29T11:30:00Z".into(),
        })
        .unwrap();

        assert_eq!(
            to_span(&interval),
            Span {
                start: "2026-10-29T09:00:00Z".into(),
                end: "2026-10-29T11:30:00Z".into(),
            }
        );
    }
}
