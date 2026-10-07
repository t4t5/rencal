//! Ported vitest suites: `src/lib/rrule-utils.test.ts`,
//! `src/lib/recurrence-edit.test.ts` and `src/lib/search-results.test.ts`.

use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};
use rencal_text::recurrence::{
    RRuleSet, anchor_range_to_recurring_master, with_nearest_occurrence,
};
use rencal_text::search::prepare_search_results;
use rencal_time::event::Recurrence;
use rencal_time::{CalendarEvent, EventTime, EventTimeRange, Tz, parse_tz};
use serde_json::json;

const BERLIN: Tz = Tz::Europe__Berlin;

fn date(s: &str) -> EventTime {
    EventTime::Date(s.parse().unwrap())
}

fn wallclock(s: &str) -> NaiveDateTime {
    NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M").unwrap()
}

/// An all-day event on `start_date` with an exclusive end the day after.
fn all_day_event(id: &str, start_date: &str, recurrence: Option<Recurrence>) -> CalendarEvent {
    let start: NaiveDate = start_date.parse().unwrap();
    serde_json::from_value::<CalendarEvent>(json!({
        "id": id,
        "start": { "kind": "date", "date": start.to_string() },
        "end": { "kind": "date", "date": start.succ_opt().unwrap().to_string() },
        "calendar_slug": "calendar",
        "recurrence": recurrence,
    }))
    .unwrap()
    .with_viewer(BERLIN)
}

fn recurrence(rrule: &str, exdates: Vec<EventTime>, rdates: Vec<EventTime>) -> Recurrence {
    Recurrence {
        rrule: rrule.into(),
        exdates,
        rdates,
    }
}

fn weekly(exdates: Vec<EventTime>, rdates: Vec<EventTime>) -> CalendarEvent {
    all_day_event(
        "weekly-event",
        "2020-06-01",
        Some(recurrence("FREQ=WEEKLY;BYDAY=MO", exdates, rdates)),
    )
}

/// The vitest suite's fake clock: 2026-07-31 12:00 local.
fn now() -> NaiveDateTime {
    wallclock("2026-07-31T12:00")
}

fn dates(event: &CalendarEvent) -> (String, String) {
    (
        event.start.date_in_viewer_zone(BERLIN).to_string(),
        event.end.date_in_viewer_zone(BERLIN).to_string(),
    )
}

fn shifted(event: CalendarEvent, now: NaiveDateTime) -> (String, String) {
    dates(&with_nearest_occurrence(event, now, BERLIN))
}

#[test]
fn shifts_a_recurring_master_to_its_next_occurrence() {
    assert_eq!(
        shifted(weekly(vec![], vec![]), now()),
        ("2026-08-03".into(), "2026-08-04".into())
    );
}

#[test]
fn keeps_the_dtstart_weekday_when_byday_is_omitted_across_dst() {
    let event = all_day_event(
        "weekly-event",
        "2020-06-01",
        Some(recurrence("FREQ=WEEKLY", vec![], vec![])),
    );
    assert_eq!(
        shifted(event, wallclock("2026-01-30T12:00")),
        ("2026-02-02".into(), "2026-02-03".into())
    );
}

#[test]
fn skips_excluded_occurrences() {
    assert_eq!(
        shifted(weekly(vec![date("2026-08-03")], vec![]), now()),
        ("2026-08-10".into(), "2026-08-11".into())
    );
}

#[test]
fn uses_an_added_rdate_before_the_next_rrule_occurrence() {
    assert_eq!(
        shifted(weekly(vec![], vec![date("2026-08-01")]), now()),
        ("2026-08-01".into(), "2026-08-02".into())
    );
}

#[test]
fn lets_exdate_exclude_an_occurrence_also_present_in_rdate() {
    let excluded = date("2026-08-01");
    let event = weekly(vec![excluded.clone()], vec![excluded]);
    assert_eq!(shifted(event, now()).0, "2026-08-03");
}

#[test]
fn uses_the_last_occurrence_when_a_finite_series_has_ended() {
    let event = all_day_event(
        "weekly-event",
        "2020-06-01",
        Some(recurrence("FREQ=WEEKLY;COUNT=3", vec![], vec![])),
    );
    assert_eq!(
        shifted(event, now()),
        ("2020-06-15".into(), "2020-06-16".into())
    );
}

#[test]
fn returns_the_master_unchanged_when_its_rule_cannot_be_parsed() {
    let event = all_day_event(
        "weekly-event",
        "2020-06-01",
        Some(recurrence("not-an-rrule", vec![], vec![])),
    );
    assert_eq!(with_nearest_occurrence(event.clone(), now(), BERLIN), event);
}

#[test]
fn passes_non_recurring_events_through_unchanged() {
    let event = all_day_event("single", "2020-06-01", None);
    assert_eq!(with_nearest_occurrence(event.clone(), now(), BERLIN), event);
}

#[test]
fn retains_rdates_through_the_editor_representation() {
    let original = recurrence(
        "FREQ=WEEKLY;BYDAY=MO",
        vec![date("2026-08-03")],
        vec![date("2026-08-04")],
    );
    let converted = RRuleSet::from_recurrence(&original, BERLIN)
        .unwrap()
        .to_recurrence(BERLIN);
    let days = |times: &[EventTime]| -> Vec<String> {
        times
            .iter()
            .map(|t| t.date_in_viewer_zone(BERLIN).to_string())
            .collect()
    };
    assert_eq!(days(&converted.exdates), ["2026-08-03"]);
    assert_eq!(days(&converted.rdates), ["2026-08-04"]);
}

fn london(wallclock_str: &str) -> EventTime {
    EventTime::zoned(wallclock(wallclock_str), parse_tz("Europe/London").unwrap())
}

#[test]
fn anchoring_converts_a_timed_master_to_an_all_day_range() {
    let current = EventTimeRange::new(date("2026-08-24"), date("2026-08-25"));
    let result = anchor_range_to_recurring_master(&current, &london("2021-08-24T09:00"), BERLIN);
    assert_eq!(
        result,
        EventTimeRange::new(date("2021-08-24"), date("2021-08-25"))
    );
}

#[test]
fn anchoring_keeps_a_timed_edit_timed_on_the_masters_date() {
    let current = EventTimeRange::new(london("2026-08-24T10:30"), london("2026-08-24T11:30"));
    let result = anchor_range_to_recurring_master(&current, &london("2021-08-24T09:00"), BERLIN);
    assert_eq!(
        result,
        EventTimeRange::new(london("2021-08-24T10:30"), london("2021-08-24T11:30"))
    );
}

#[test]
fn search_ranks_a_recurring_event_by_its_displayed_occurrence() {
    let events = vec![
        all_day_event("2015 event", "2015-08-06", None),
        all_day_event("2013 event", "2013-12-05", None),
        all_day_event(
            "recurring event",
            "2010-05-14",
            Some(recurrence(
                "FREQ=YEARLY;BYMONTH=5;BYMONTHDAY=14",
                vec![],
                vec![],
            )),
        ),
    ];
    let now: DateTime<Utc> = "2026-07-31T10:00:00Z".parse().unwrap();
    let ids: Vec<String> = prepare_search_results(events, now, BERLIN)
        .into_iter()
        .map(|e| e.id)
        .collect();
    assert_eq!(ids, ["recurring event", "2015 event", "2013 event"]);
}
