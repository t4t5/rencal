//! Maps between a core `Availability` and the editor's `AvailabilityDraft`.
//! Apply replaces only the summary, blocks and booking rules; everything else
//! in the file (UID, overrides, `X-*`, description, URL, organizer, window)
//! is left as loaded.

use std::collections::{BTreeMap, BTreeSet};

use caldir_core::availability::{Availability, AvailableBlock, BookingRules};
use caldir_core::{EventTime, Interval};
use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveTime, SecondsFormat, Timelike, Utc};
use chrono_tz::Tz;

use super::types::{AvailabilityDraft, DayHours, Span, TimeRange, Weekday};
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};

const WEEKDAYS: [(Weekday, chrono::Weekday, &str); 7] = [
    (Weekday::Mo, chrono::Weekday::Mon, "MO"),
    (Weekday::Tu, chrono::Weekday::Tue, "TU"),
    (Weekday::We, chrono::Weekday::Wed, "WE"),
    (Weekday::Th, chrono::Weekday::Thu, "TH"),
    (Weekday::Fr, chrono::Weekday::Fri, "FR"),
    (Weekday::Sa, chrono::Weekday::Sat, "SA"),
    (Weekday::Su, chrono::Weekday::Sun, "SU"),
];

/// A weekly block as the editor sees it.
#[derive(Debug, Clone, PartialEq, Eq)]
struct WeeklyBlock {
    days: BTreeSet<Weekday>,
    start: NaiveTime,
    end: NaiveTime,
    tzid: String,
}

/// What a draft says about the hours, normalised: sorted, merged ranges per day.
type Hours = BTreeMap<Weekday, Vec<(NaiveTime, NaiveTime)>>;

pub(super) struct Decomposed {
    pub draft: AvailabilityDraft,
    pub hours_editable: bool,
}

/// `fallback_tzid` names the zone when the blocks don't carry one.
pub(super) fn decompose(availability: &Availability, fallback_tzid: &str) -> Decomposed {
    let weekly = weekly_blocks(availability);
    let hours_editable = weekly.is_some();
    let weekly = weekly.unwrap_or_default();

    let tzid = weekly
        .first()
        .map(|block| block.tzid.clone())
        .or_else(|| availability.tzid().map(str::to_string))
        .unwrap_or_else(|| fallback_tzid.to_string());

    let hours = match hours_editable {
        true => hours_to_dto(&hours_of(&weekly)),
        false => Vec::new(),
    };
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

/// Apply `draft` onto `base`. `today` anchors new blocks.
pub(super) fn apply(
    base: &Availability,
    draft: &AvailabilityDraft,
    today: impl Fn(Tz) -> NaiveDate,
) -> TauResult<Availability> {
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
            draft.tzid == original.draft.tzid && hours == parse_hours(&original.draft.hours)?;
        if !unchanged {
            availability.blocks = build_blocks(&base.blocks, &hours, tz, today(tz));
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

/// One block per distinct range, covering every day that has it, so Mon–Fri
/// 09–17 stays one `RRULE`. A block that already says exactly that is reused,
/// UID and `DTSTART` included.
fn build_blocks(
    existing: &[AvailableBlock],
    hours: &Hours,
    tz: Tz,
    today: NaiveDate,
) -> Vec<AvailableBlock> {
    let mut by_range: BTreeMap<(NaiveTime, NaiveTime), BTreeSet<Weekday>> = BTreeMap::new();
    for (day, ranges) in hours {
        for range in ranges {
            by_range.entry(*range).or_default().insert(*day);
        }
    }

    by_range
        .into_iter()
        .filter_map(|((start, end), days)| {
            let wanted = WeeklyBlock {
                days: days.clone(),
                start,
                end,
                tzid: tz.name().to_string(),
            };
            if let Some(block) = existing
                .iter()
                .find(|block| weekly_block(block).as_ref() == Some(&wanted))
            {
                return Some(block.clone());
            }
            let days: Vec<chrono::Weekday> = days.iter().map(|day| chrono_weekday(*day)).collect();
            AvailableBlock::weekly(&days, start, end, tz, today)
        })
        .collect()
}

/// Every block as a plain weekly series in one zone, or `None` when the file
/// says something the hours editor can't show.
fn weekly_blocks(availability: &Availability) -> Option<Vec<WeeklyBlock>> {
    if availability.start.is_some() || availability.end.is_some() {
        return None;
    }
    let blocks: Vec<WeeklyBlock> = availability
        .blocks
        .iter()
        .map(weekly_block)
        .collect::<Option<_>>()?;
    let one_zone = blocks.windows(2).all(|pair| pair[0].tzid == pair[1].tzid);
    one_zone.then_some(blocks)
}

/// `FREQ=WEEKLY;BYDAY=…` only, zoned, starting and ending on the same day on
/// one of its weekdays, with nothing on the block the editor would drop.
fn weekly_block(block: &AvailableBlock) -> Option<WeeklyBlock> {
    let (
        EventTime::DateTimeZoned {
            datetime: start,
            tzid,
        },
        EventTime::DateTimeZoned {
            datetime: end,
            tzid: end_tzid,
        },
    ) = (&block.start, &block.end)
    else {
        return None;
    };
    let recurrence = block.recurrence.as_ref()?;
    if tzid != end_tzid
        || start.date() != end.date()
        || end <= start
        || start.time().second() != 0
        || end.time().second() != 0
        || !recurrence.exdates.is_empty()
        || !recurrence.rdates.is_empty()
        || block.summary.is_some()
        || !block.x_properties.is_empty()
    {
        return None;
    }

    let days = weekly_byday(&recurrence.rrule)?;
    let first_day = WEEKDAYS
        .iter()
        .find(|(_, weekday, _)| *weekday == start.weekday())
        .map(|(day, _, _)| *day)?;
    if !days.contains(&first_day) {
        return None;
    }

    Some(WeeklyBlock {
        days,
        start: start.time(),
        end: end.time(),
        tzid: tzid.clone(),
    })
}

/// The days of an `RRULE` that has exactly `FREQ=WEEKLY` and a plain `BYDAY`.
fn weekly_byday(rrule: &str) -> Option<BTreeSet<Weekday>> {
    let mut freq = None;
    let mut byday = None;
    for part in rrule.split(';').filter(|part| !part.is_empty()) {
        let (key, value) = part.split_once('=')?;
        match key.to_ascii_uppercase().as_str() {
            "FREQ" if freq.is_none() => freq = Some(value.to_ascii_uppercase()),
            "BYDAY" if byday.is_none() => byday = Some(value.to_ascii_uppercase()),
            _ => return None,
        }
    }
    if freq.as_deref() != Some("WEEKLY") {
        return None;
    }
    byday?
        .split(',')
        .map(|code| {
            WEEKDAYS
                .iter()
                .find(|(_, _, c)| *c == code)
                .map(|(day, _, _)| *day)
        })
        .collect::<Option<BTreeSet<_>>>()
        .filter(|days| !days.is_empty())
}

fn hours_of(blocks: &[WeeklyBlock]) -> Hours {
    let mut hours = Hours::new();
    for block in blocks {
        for day in &block.days {
            hours
                .entry(*day)
                .or_default()
                .push((block.start, block.end));
        }
    }
    for ranges in hours.values_mut() {
        *ranges = merge_ranges(std::mem::take(ranges));
    }
    hours
}

/// Every weekday in Monday-first order, empty when unavailable.
fn hours_to_dto(hours: &Hours) -> Vec<DayHours> {
    WEEKDAYS
        .iter()
        .map(|(day, _, _)| DayHours {
            day: *day,
            ranges: hours
                .get(day)
                .into_iter()
                .flatten()
                .map(|(start, end)| TimeRange {
                    start: format_time(*start),
                    end: format_time(*end),
                })
                .collect(),
        })
        .collect()
}

fn parse_hours(days: &[DayHours]) -> TauResult<Hours> {
    let mut hours = Hours::new();
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
            hours.entry(day.day).or_default().push((start, end));
        }
    }
    for ranges in hours.values_mut() {
        *ranges = merge_ranges(std::mem::take(ranges));
    }
    hours.retain(|_, ranges| !ranges.is_empty());
    Ok(hours)
}

/// Sort and coalesce overlapping or touching ranges.
fn merge_ranges(mut ranges: Vec<(NaiveTime, NaiveTime)>) -> Vec<(NaiveTime, NaiveTime)> {
    ranges.sort();
    let mut merged: Vec<(NaiveTime, NaiveTime)> = Vec::with_capacity(ranges.len());
    for (start, end) in ranges {
        match merged.last_mut() {
            Some(last) if start <= last.1 => last.1 = last.1.max(end),
            _ => merged.push((start, end)),
        }
    }
    merged
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
        .find(|(d, _, _)| *d == day)
        .map(|(_, weekday, _)| *weekday)
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
    use caldir_core::Recurrence;
    use caldir_core::availability::AvailabilityOverride;

    const STOCKHOLM: &str = "Europe/Stockholm";

    // A Wednesday.
    fn today(_: Tz) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 10, 28).unwrap()
    }

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
            .map(|(d, _, _)| match d {
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
        AvailableBlock::weekly(
            days,
            start,
            end,
            chrono_tz::Europe::Stockholm,
            today(chrono_tz::UTC),
        )
        .unwrap()
    }

    fn new_from(draft: &AvailabilityDraft) -> Availability {
        apply(&Availability::new(Vec::new()), draft, today).unwrap()
    }

    fn rrules(availability: &Availability) -> Vec<&str> {
        availability
            .blocks
            .iter()
            .map(|block| block.recurrence.as_ref().unwrap().rrule.as_str())
            .collect()
    }

    #[test]
    fn identical_days_share_one_block_per_range() {
        let availability = new_from(&draft(weekdays(&[("09:00", "12:00"), ("13:00", "17:00")])));

        assert_eq!(
            rrules(&availability),
            [
                "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
                "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
            ]
        );
        assert_eq!(
            availability.blocks[0].start,
            EventTime::DateTimeZoned {
                datetime: today(chrono_tz::UTC).and_time(time(9, 0)),
                tzid: STOCKHOLM.into(),
            }
        );
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

        let applied = apply(&base, &edited, today).unwrap();

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

        let applied = apply(&base, &edited, today).unwrap();

        assert_eq!(applied.blocks.len(), 2);
        assert_eq!(applied.blocks[0], base.blocks[0]);
        assert_ne!(applied.blocks[1].uid, base.blocks[1].uid);
    }

    #[test]
    fn timezone_change_keeps_wall_clock_hours() {
        let base = new_from(&draft(weekdays(&[("09:00", "17:00")])));
        let mut edited = decompose(&base, "UTC").draft;
        edited.tzid = "America/New_York".into();

        let applied = apply(&base, &edited, today).unwrap();
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

        let applied = apply(&base, &edited, today).unwrap();

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

        let applied = apply(&base, &edited, today).unwrap();

        assert_eq!(applied.to_ics_string(), base.to_ics_string());
    }

    #[test]
    fn unchanged_rules_keep_their_exact_file_value() {
        let mut base = new_from(&draft(weekdays(&[("09:00", "17:00")])));
        base.rules.horizon = Duration::hours(36);
        let mut edited = decompose(&base, "UTC").draft;
        assert_eq!(edited.horizon_days, 2);
        edited.duration_minutes = 60;

        let applied = apply(&base, &edited, today).unwrap();

        assert_eq!(applied.rules.horizon, Duration::hours(36));
        assert_eq!(applied.rules.duration, Duration::minutes(60));
    }

    #[test]
    fn non_weekly_blocks_are_read_only_and_survive_a_save() {
        let one_off = AvailableBlock::new(
            EventTime::DateTimeZoned {
                datetime: today(chrono_tz::UTC).and_time(time(9, 0)),
                tzid: STOCKHOLM.into(),
            },
            EventTime::DateTimeZoned {
                datetime: today(chrono_tz::UTC).and_time(time(10, 0)),
                tzid: STOCKHOLM.into(),
            },
        );
        let mut daily = weekly(&[chrono::Weekday::Mon], time(9, 0), time(17, 0));
        daily.recurrence = Some(Recurrence::new("FREQ=DAILY"));
        let mut counted = weekly(&[chrono::Weekday::Mon], time(9, 0), time(17, 0));
        counted.recurrence = Some(Recurrence::new("FREQ=WEEKLY;BYDAY=MO;COUNT=3"));

        for blocks in [vec![one_off], vec![daily], vec![counted]] {
            let base = Availability::new(blocks);
            let decomposed = decompose(&base, "UTC");
            assert!(!decomposed.hours_editable);
            assert!(decomposed.draft.hours.is_empty());
            assert_eq!(decomposed.draft.tzid, STOCKHOLM);

            let mut edited = decomposed.draft;
            edited.name = "Renamed".into();
            let applied = apply(&base, &edited, today).unwrap();
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
                today(chrono_tz::UTC),
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
            let error = apply(&base, &case, today).unwrap_err();
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
