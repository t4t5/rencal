//! Port of `src/lib/event-time.test.ts` and `src/lib/cal-events.test.ts`. Cases
//! the golden fixtures already pin exactly are left out; the viewer-zone store
//! tests are gone with the store (the zone is an argument now).

use rencal_time::event::{
    CalendarEvent, Recurrence, reconcile_optimistic_create, rollback_optimistic_create,
};
use rencal_time::tz::{list_time_zones, time_zone_city, time_zone_offset_label};
use rencal_time::{
    EventDateInfo, EventTime, EventTimeRange, FirstDayOfWeek, NaiveDate, Tz, date_from_epoch_day,
    epoch_day, iso_week_number, start_of_week,
};
use serde_json::json;

const STOCKHOLM: Tz = chrono_tz::Europe::Stockholm;
const LA: Tz = chrono_tz::America::Los_Angeles;

fn time(value: serde_json::Value) -> EventTime {
    serde_json::from_value(value).unwrap()
}

fn date(s: &str) -> EventTime {
    time(json!({ "kind": "date", "date": s }))
}

fn utc(s: &str) -> EventTime {
    time(json!({ "kind": "datetime_utc", "instant": s }))
}

fn floating(s: &str) -> EventTime {
    time(json!({ "kind": "datetime_floating", "wallclock": s }))
}

fn zoned(wallclock: &str, tzid: &str) -> EventTime {
    time(json!({ "kind": "datetime_zoned", "wallclock": wallclock, "tzid": tzid }))
}

fn wire(t: &EventTime) -> serde_json::Value {
    serde_json::to_value(t).unwrap()
}

fn day(s: &str) -> NaiveDate {
    s.parse().unwrap()
}

fn info(start: &EventTime, end: &EventTime) -> EventDateInfo {
    EventDateInfo::compute(start, end, STOCKHOLM)
}

fn occupied(start: &EventTime, end: &EventTime) -> Vec<String> {
    info(start, end)
        .occupied_days()
        .map(|d| date_from_epoch_day(d).to_string())
        .collect()
}

#[test]
fn wire_round_trips() {
    for value in [
        json!({ "kind": "date", "date": "2026-04-28" }),
        json!({ "kind": "datetime_floating", "wallclock": "2026-04-28T09:00:00" }),
        json!({ "kind": "datetime_zoned", "wallclock": "2026-04-28T09:00:00", "tzid": "America/Los_Angeles" }),
        json!({ "kind": "datetime_utc", "instant": "2026-04-28T10:00:00Z" }),
    ] {
        assert_eq!(wire(&time(value.clone())), value);
    }
    // Other offsets parse to the same instant.
    assert_eq!(
        utc("2026-04-28T12:00:00+02:00"),
        utc("2026-04-28T10:00:00Z")
    );
}

#[test]
fn rejects_unknown_zones_and_malformed_values() {
    let bad =
        json!({ "kind": "datetime_zoned", "wallclock": "2026-04-28T09:00:00", "tzid": "GMT+0100" });
    assert!(serde_json::from_value::<EventTime>(bad).is_err());
    assert!(
        serde_json::from_value::<EventTime>(json!({ "kind": "date", "date": "nope" })).is_err()
    );
}

#[test]
fn zone_ids_are_case_insensitive() {
    assert_eq!(
        wire(&zoned("2026-04-28T09:00:00", "europe/stockholm"))["tzid"],
        "Europe/Stockholm"
    );
}

#[test]
fn is_all_day() {
    assert!(date("2026-04-28").is_all_day());
    assert!(!zoned("2026-04-28T09:00:00", "Europe/Stockholm").is_all_day());
    assert!(!utc("2026-04-28T10:00:00Z").is_all_day());
    assert!(!floating("2026-04-28T09:00:00").is_all_day());
}

#[test]
fn wallclock_edits_use_the_events_own_zone() {
    let before = zoned("2026-04-28T09:00:00", "America/Los_Angeles");
    assert_eq!(
        before.with_wallclock_time(10, 30, STOCKHOLM),
        zoned("2026-04-28T10:30:00", "America/Los_Angeles")
    );
    assert_eq!(before.wallclock_time(STOCKHOLM), (9, 0));
    assert_eq!(
        before.with_event_date(day("2026-05-15"), STOCKHOLM),
        zoned("2026-05-15T09:00:00", "America/Los_Angeles")
    );

    let all_day = date("2026-04-28");
    assert_eq!(all_day.with_wallclock_time(10, 30, STOCKHOLM), all_day);
    assert_eq!(all_day.wallclock_time(STOCKHOLM), (0, 0));
    assert_eq!(
        all_day.with_event_date(day("2026-05-15"), STOCKHOLM),
        date("2026-05-15")
    );

    assert_eq!(
        floating("2026-04-28T09:00:00").with_wallclock_time(11, 15, STOCKHOLM),
        floating("2026-04-28T11:15:00")
    );
}

#[test]
fn date_in_event_zone_is_the_events_own_date() {
    let late = zoned("2026-04-28T23:00:00", "Europe/Stockholm");
    assert_eq!(late.date_in_event_zone(LA), day("2026-04-28"));
}

#[test]
fn add_days_keeps_wallclock_across_dst() {
    let saturday = zoned("2026-03-28T09:00:00", "Europe/Stockholm");
    assert_eq!(
        saturday.add_days(1),
        zoned("2026-03-29T09:00:00", "Europe/Stockholm")
    );
    assert_eq!(date("2026-02-28").add_days(1), date("2026-03-01"));
}

#[test]
fn add_minutes_is_exact_time_across_dst() {
    let before = zoned("2026-03-29T01:30:00", "Europe/Stockholm");
    assert_eq!(
        before.add_minutes(60),
        zoned("2026-03-29T03:30:00", "Europe/Stockholm")
    );
}

#[test]
fn all_day_toggles_are_inverse() {
    let timed = date("2026-04-28").to_timed_at_start_of_day(STOCKHOLM);
    assert_eq!(timed, zoned("2026-04-28T00:00:00", "Europe/Stockholm"));
    assert_eq!(timed.to_all_day(STOCKHOLM), date("2026-04-28"));
    assert!(
        zoned("2026-04-28T09:00:00", "Europe/Stockholm")
            .to_all_day(STOCKHOLM)
            .is_all_day()
    );
}

#[test]
fn date_info_projections_and_day_range() {
    let start = zoned("2026-04-28T10:00:00", "Europe/Stockholm");
    let end = zoned("2026-04-28T10:30:00", "Europe/Stockholm");
    let i = info(&start, &end);
    assert_eq!(i.end_ms - i.start_ms, 30 * 60_000);

    // All-day ends are exclusive.
    let i = info(&date("2026-04-28"), &date("2026-04-29"));
    assert_eq!(i.first_day, i.last_day);
    let i = info(&date("2026-04-28"), &date("2026-05-01"));
    assert_eq!(i.first_day, epoch_day(day("2026-04-28")));
    assert_eq!(i.last_day, epoch_day(day("2026-04-30")));

    // Ending exactly at midnight stays on the previous day; past it, two days.
    let late = zoned("2026-04-28T22:00:00", "Europe/Stockholm");
    let i = info(&late, &zoned("2026-04-29T00:00:00", "Europe/Stockholm"));
    assert_eq!(i.first_day, i.last_day);
    let i = info(&late, &zoned("2026-04-29T01:00:00", "Europe/Stockholm"));
    assert!(i.last_day > i.first_day);

    // Midnight is detected in whatever zone the viewer is in now.
    let ny = chrono_tz::America::New_York;
    let i = EventDateInfo::compute(
        &zoned("2026-08-17T22:00:00", "America/New_York"),
        &zoned("2026-08-18T00:00:00", "America/New_York"),
        ny,
    );
    assert_eq!(i.first_day, i.last_day);

    // Exclusive all-day ends use calendar arithmetic across DST.
    let i = EventDateInfo::compute(
        &date("2026-03-28"),
        &date("2026-03-30"),
        chrono_tz::Europe::London,
    );
    assert_eq!(i.last_day, epoch_day(day("2026-03-29")));
}

#[test]
fn same_day_in_viewer_zone() {
    let a = zoned("2026-04-28T09:00:00", "Europe/Stockholm");
    let b = zoned("2026-04-28T22:00:00", "Europe/Stockholm");
    assert!(a.is_same_day(&b, STOCKHOLM));
    let c = zoned("2026-04-28T23:00:00", "Europe/Stockholm");
    let d = zoned("2026-04-29T01:00:00", "Europe/Stockholm");
    assert!(!c.is_same_day(&d, STOCKHOLM));
}

#[test]
fn normalize_all_day_range() {
    let bumped =
        EventTimeRange::normalize_all_day(date("2026-04-28"), date("2026-04-28"), STOCKHOLM);
    assert_eq!(bumped.end, date("2026-04-29"));
    let valid =
        EventTimeRange::normalize_all_day(date("2026-04-28"), date("2026-05-01"), STOCKHOLM);
    assert_eq!(valid.end, date("2026-05-01"));
}

#[test]
fn epoch_days_round_trip() {
    for iso in [
        "1970-01-01",
        "1969-12-31",
        "1900-03-01",
        "2000-02-29",
        "2000-03-01",
        "2024-02-29",
        "2026-01-01",
        "2026-04-28",
        "2026-12-31",
        "2100-02-28",
        "2100-03-01",
    ] {
        let d = day(iso);
        let key = epoch_day(d);
        let reference = d.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp() / 86_400;
        assert_eq!(i64::from(key), reference, "{iso}");
        assert_eq!(date_from_epoch_day(key), d);
    }
}

#[test]
fn occupied_days() {
    let z = |s| zoned(s, "Europe/Stockholm");
    assert_eq!(
        occupied(&z("2026-04-28T09:00:00"), &z("2026-04-28T10:00:00")),
        ["2026-04-28"]
    );
    assert_eq!(
        occupied(&z("2026-04-28T19:00:00"), &z("2026-05-01T05:00:00")),
        ["2026-04-28", "2026-04-29", "2026-04-30", "2026-05-01"]
    );
    assert_eq!(
        occupied(&z("2026-04-28T19:00:00"), &z("2026-05-01T00:00:00")),
        ["2026-04-28", "2026-04-29", "2026-04-30"]
    );
    assert_eq!(
        occupied(&date("2026-04-28"), &date("2026-05-01")),
        ["2026-04-28", "2026-04-29", "2026-04-30"]
    );
    assert_eq!(
        occupied(&date("2026-04-28"), &date("2026-04-28")),
        ["2026-04-28"]
    );
    // An end before the start still occupies the start day.
    assert_eq!(
        occupied(&z("2026-04-28T09:00:00"), &z("2026-04-26T09:00:00")),
        ["2026-04-28"]
    );
}

#[test]
fn covers_full_day() {
    let covers = |start: &str, end: &str, on: &str| {
        let (s, e) = (
            zoned(start, "Europe/Stockholm"),
            zoned(end, "Europe/Stockholm"),
        );
        info(&s, &e).covers_full_day(&s, epoch_day(day(on)))
    };
    // Single-day and overnight partial events.
    assert!(!covers(
        "2026-07-24T19:00:00",
        "2026-07-24T21:00:00",
        "2026-07-24"
    ));
    assert!(!covers(
        "2026-07-24T19:00:00",
        "2026-07-25T05:00:00",
        "2026-07-24"
    ));
    assert!(!covers(
        "2026-07-24T19:00:00",
        "2026-07-25T05:00:00",
        "2026-07-25"
    ));
    // Only the middle days of a multi-day event.
    for (on, expected) in [
        ("2026-07-24", false),
        ("2026-07-25", true),
        ("2026-07-26", true),
        ("2026-07-27", false),
    ] {
        assert_eq!(
            covers("2026-07-24T19:00:00", "2026-07-27T05:00:00", on),
            expected,
            "{on}"
        );
    }
    // Boundary days starting or ending exactly at midnight.
    assert!(covers(
        "2026-07-24T00:00:00",
        "2026-07-25T05:00:00",
        "2026-07-24"
    ));
    assert!(!covers(
        "2026-07-24T00:00:00",
        "2026-07-25T05:00:00",
        "2026-07-25"
    ));
    assert!(!covers(
        "2026-07-24T19:00:00",
        "2026-07-26T00:00:00",
        "2026-07-24"
    ));
    assert!(covers(
        "2026-07-24T19:00:00",
        "2026-07-26T00:00:00",
        "2026-07-25"
    ));
    assert!(covers(
        "2026-07-24T00:00:00",
        "2026-07-25T00:00:00",
        "2026-07-24"
    ));
    // A partial event ending at the next midnight stays partial.
    assert!(!covers(
        "2026-07-24T19:00:00",
        "2026-07-25T00:00:00",
        "2026-07-24"
    ));
    // All-day events cover the days they occupy.
    let all_day = date("2026-07-24");
    assert!(
        info(&all_day, &date("2026-07-25")).covers_full_day(&all_day, epoch_day(day("2026-07-24")))
    );
}

#[test]
fn ordering_instants() {
    let stockholm = zoned("2026-04-28T09:00:00", "Europe/Stockholm");
    let la = zoned("2026-04-28T09:00:00", "America/Los_Angeles");
    assert!(stockholm.ordering_ms(STOCKHOLM) < la.ordering_ms(STOCKHOLM));
}

#[test]
fn viewer_projections_follow_the_viewer_zone() {
    use chrono::Timelike;
    let t = zoned("2026-04-28T09:00:00", "Europe/Stockholm");
    assert_eq!(t.to_viewer_zoned(LA).hour(), 0);
    assert_eq!(t.date_in_viewer_zone(LA), day("2026-04-28"));
    let kiritimati = chrono_tz::Pacific::Kiritimati;
    assert_eq!(t.to_viewer_zoned(kiritimati).hour(), 21);
    assert_eq!(t.date_in_viewer_zone(kiritimati), day("2026-04-28"));
}

#[test]
fn start_of_week_both_conventions() {
    use FirstDayOfWeek::{Monday, Sunday};
    // 2024-01-01 was a Monday.
    let (monday, wednesday, saturday, sunday) = (
        day("2024-01-01"),
        day("2024-01-03"),
        day("2024-01-06"),
        day("2024-01-07"),
    );
    for d in [monday, wednesday, sunday] {
        assert_eq!(start_of_week(d, Monday), monday);
    }
    let previous_sunday = day("2023-12-31");
    for d in [previous_sunday, monday, wednesday, saturday] {
        assert_eq!(start_of_week(d, Sunday), previous_sunday);
    }
    assert_eq!(start_of_week(sunday, Sunday), sunday);
}

#[test]
fn event_tz() {
    assert_eq!(
        zoned("2026-04-28T09:00:00", "America/Los_Angeles").event_tz(STOCKHOLM),
        LA
    );
    for t in [
        floating("2026-04-28T09:00:00"),
        utc("2026-04-28T09:00:00Z"),
        date("2026-04-28"),
    ] {
        assert_eq!(t.event_tz(STOCKHOLM), STOCKHOLM);
    }
}

#[test]
fn with_event_time_zone_keeps_wallclock() {
    let london = chrono_tz::Europe::London;
    let moved =
        zoned("2026-04-28T09:00:00", "Europe/Stockholm").with_event_time_zone(london, STOCKHOLM);
    assert_eq!(moved, zoned("2026-04-28T09:00:00", "Europe/London"));
    assert_eq!(
        moved.instant_for_ordering(STOCKHOLM),
        utc("2026-04-28T08:00:00Z").instant_for_ordering(STOCKHOLM)
    );

    assert_eq!(
        floating("2026-04-28T09:00:00").with_event_time_zone(chrono_tz::Asia::Kolkata, STOCKHOLM),
        zoned("2026-04-28T09:00:00", "Asia/Kolkata")
    );
    // A UTC instant carries over its viewer-zone wallclock.
    assert_eq!(
        utc("2026-04-28T07:00:00Z").with_event_time_zone(london, STOCKHOLM),
        zoned("2026-04-28T09:00:00", "Europe/London")
    );
    assert_eq!(
        date("2026-04-28").with_event_time_zone(london, STOCKHOLM),
        date("2026-04-28")
    );
}

#[test]
fn range_zone_edits() {
    let range = EventTimeRange::new(
        zoned("2026-04-28T09:00:00", "Europe/Stockholm"),
        zoned("2026-04-28T10:30:00", "Europe/Stockholm"),
    );
    let ny = range.with_time_zone(chrono_tz::America::New_York, STOCKHOLM);
    assert_eq!(ny.start, zoned("2026-04-28T09:00:00", "America/New_York"));
    assert_eq!(ny.end, zoned("2026-04-28T10:30:00", "America/New_York"));

    let london = EventTimeRange::new(
        zoned("2026-04-28T09:00:00", "Europe/London"),
        zoned("2026-04-28T10:30:00", "Europe/London"),
    );
    let viewer = london.with_viewer_zone(STOCKHOLM);
    assert_eq!(
        viewer.start,
        zoned("2026-04-28T10:00:00", "Europe/Stockholm")
    );
    assert_eq!(viewer.end, zoned("2026-04-28T11:30:00", "Europe/Stockholm"));

    let all_day = EventTimeRange::new(date("2026-04-28"), date("2026-04-29"));
    assert_eq!(all_day.with_viewer_zone(STOCKHOLM), all_day);
}

#[test]
fn time_zone_labels() {
    assert_eq!(time_zone_city("Europe/London"), "London");
    assert_eq!(
        time_zone_city("America/Argentina/Buenos_Aires"),
        "Buenos Aires"
    );
    assert_eq!(time_zone_city("UTC"), "UTC");

    let summer = zoned("2026-07-01T10:00:00", "UTC");
    let winter = zoned("2026-01-01T10:00:00", "UTC");
    let label = |tz: Tz, at: &EventTime| time_zone_offset_label(tz, at, STOCKHOLM);
    assert_eq!(label(chrono_tz::Europe::London, &summer), "GMT+1");
    assert_eq!(label(chrono_tz::Europe::London, &winter), "GMT+0");
    assert_eq!(label(chrono_tz::Asia::Kolkata, &summer), "GMT+5:30");
    assert_eq!(label(chrono_tz::America::Sao_Paulo, &summer), "GMT-3");
    assert_eq!(label(Tz::UTC, &summer), "GMT+0");

    let zones = list_time_zones();
    assert!(zones.contains(&chrono_tz::Europe::London));
    assert_eq!(zones.last(), Some(&Tz::UTC));
    assert!(
        zones
            .iter()
            .all(|z| *z == Tz::UTC || (z.name().contains('/') && !z.name().starts_with("Etc/")))
    );
}

#[test]
fn iso_week_numbers() {
    use FirstDayOfWeek::{Monday, Sunday};
    assert_eq!(iso_week_number(day("2026-08-24"), Monday), 35);
    assert_eq!(iso_week_number(day("2026-08-30"), Monday), 35);
    // A Sunday-first row is numbered by its Thursday.
    assert_eq!(iso_week_number(day("2026-08-23"), Sunday), 35);
    assert_eq!(iso_week_number(day("2026-08-29"), Sunday), 35);
    assert_eq!(iso_week_number(day("2026-08-23"), Monday), 34);
    // ISO year boundaries.
    assert_eq!(iso_week_number(day("2024-12-30"), Monday), 1);
    assert_eq!(iso_week_number(day("2024-12-29"), Sunday), 1);
    assert_eq!(iso_week_number(day("2021-01-01"), Monday), 53);
    assert_eq!(iso_week_number(day("2021-01-01"), Sunday), 53);
}

// cal-events.test.ts

fn event(id: &str, summary: &str) -> CalendarEvent {
    serde_json::from_value::<CalendarEvent>(json!({
        "id": id,
        "summary": summary,
        "start": { "kind": "date", "date": "2026-09-15" },
        "end": { "kind": "date", "date": "2026-09-16" },
        "calendar_slug": "calendar",
    }))
    .unwrap()
    .with_viewer(STOCKHOLM)
}

fn ids(events: &[CalendarEvent]) -> Vec<(&str, &str)> {
    events
        .iter()
        .map(|e| (e.id.as_str(), e.summary.as_str()))
        .collect()
}

#[test]
fn recurrence_round_trips_rdates_and_exdates() {
    let value = json!({
        "rrule": "FREQ=WEEKLY;BYDAY=MO",
        "exdates": [{ "kind": "date", "date": "2026-09-21" }],
        "rdates": [
            { "kind": "date", "date": "2026-09-22" },
            { "kind": "datetime_zoned", "wallclock": "2026-09-29T09:30:00", "tzid": "Europe/London" },
        ],
    });
    let recurrence: Recurrence = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(&recurrence).unwrap(), value);
}

#[test]
fn deserialized_events_fill_rpc_defaults() {
    let e = event("a", "A");
    assert_eq!(e.key().0, "calendar::a");
    assert!(e.attendees.is_empty() && e.recurrence.is_none());
    assert_eq!(e.date_info.first_day, epoch_day(day("2026-09-15")));
}

#[test]
fn optimistic_create_replaces_the_optimistic_row() {
    let optimistic = event("optimistic", "Draft");
    let mut events = vec![event("existing", "Existing"), optimistic.clone()];
    reconcile_optimistic_create(&mut events, &optimistic.key(), event("created", "Created"));
    assert_eq!(
        ids(&events),
        [("existing", "Existing"), ("created", "Created")]
    );
}

#[test]
fn optimistic_create_appends_after_a_concurrent_reload() {
    let mut events = vec![event("existing", "Reloaded")];
    reconcile_optimistic_create(
        &mut events,
        &event("optimistic", "Draft").key(),
        event("created", "Created"),
    );
    assert_eq!(
        ids(&events),
        [("existing", "Reloaded"), ("created", "Created")]
    );
}

#[test]
fn optimistic_create_does_not_duplicate_a_fetched_event() {
    let created = event("created", "Created");
    let mut events = vec![created.clone()];
    reconcile_optimistic_create(&mut events, &event("optimistic", "Draft").key(), created);
    assert_eq!(ids(&events), [("created", "Created")]);
}

#[test]
fn failed_create_rolls_back() {
    let optimistic = event("optimistic", "Draft");
    let mut events = vec![event("existing", "Existing"), optimistic.clone()];
    rollback_optimistic_create(&mut events, &optimistic.key());
    assert_eq!(ids(&events), [("existing", "Existing")]);
}
