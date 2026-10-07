//! Golden fixtures from the TS implementation (`scripts/fixtures/time.fixtures.ts`).
//! Each test rebuilds a case's `output` from its `input` and compares JSON.

use chrono::{DateTime, NaiveDate, Timelike};
use rencal_time::display::{self, DatePartStyle, TimeFormat};
use rencal_time::event::start_range_for_date;
use rencal_time::tz::{time_zone_city, time_zone_offset_label};
use rencal_time::{
    EventDateInfo, EventTime, EventTimeRange, Tz, at_time, date_from_epoch_day, day, epoch_day,
    iso_week_number, parse_tz, start_of_week, zoned_offset,
};
use serde_json::{Map, Value, json};

fn load(name: &str) -> Vec<Value> {
    let path = format!("{}/tests/fixtures/{name}.json", env!("CARGO_MANIFEST_DIR"));
    let json: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    json["cases"].as_array().unwrap().clone()
}

/// Run every case through `f` and fail with the mismatching cases.
fn check(name: &str, f: impl Fn(&Value) -> Value) {
    let cases = load(name);
    assert!(!cases.is_empty());
    let mut failures = Vec::new();
    for case in &cases {
        let actual = f(&case["input"]);
        if actual != case["output"] {
            failures.push(format!(
                "{}\n  expected: {}\n  actual:   {}",
                case["name"], case["output"], actual
            ));
        }
    }
    assert!(
        failures.is_empty(),
        "{name}: {}/{} cases differ:\n{}",
        failures.len(),
        cases.len(),
        failures
            .iter()
            .take(15)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
}

fn viewer(input: &Value) -> Tz {
    parse_tz(input["viewerTz"].as_str().unwrap()).unwrap()
}

fn time(value: &Value) -> EventTime {
    serde_json::from_value(value.clone()).unwrap()
}

fn date(value: &Value) -> NaiveDate {
    value.as_str().unwrap().parse().unwrap()
}

fn now_today(input: &Value, viewer: Tz) -> NaiveDate {
    let now: DateTime<chrono::Utc> = input["now"].as_str().unwrap().parse().unwrap();
    rencal_time::today(now, viewer)
}

fn rpc(t: &EventTime) -> Value {
    serde_json::to_value(t).unwrap()
}

fn rpc_range(r: &EventTimeRange) -> Value {
    json!({ "start": rpc(&r.start), "end": rpc(&r.end) })
}

/// Temporal `ZonedDateTime.toString()`.
fn temporal_zoned(dt: &DateTime<Tz>) -> String {
    let nanos = dt.nanosecond();
    let fraction = if nanos == 0 {
        String::new()
    } else {
        format!(".{}", format!("{nanos:09}").trim_end_matches('0'))
    };
    format!(
        "{}{fraction}{}[{}]",
        dt.format("%Y-%m-%dT%H:%M:%S"),
        zoned_offset(dt),
        dt.timezone().name()
    )
}

fn map<K: ToString, T>(keys: impl IntoIterator<Item = K>, f: impl Fn(&K) -> T) -> Value
where
    T: Into<Value>,
{
    let mut out = Map::new();
    for key in keys {
        out.insert(key.to_string(), f(&key).into());
    }
    Value::Object(out)
}

#[test]
fn parse() {
    check("parse", |input| {
        let v = viewer(input);
        let t = time(&input["time"]);
        json!({
            "normalized": rpc(&t),
            "offset": match &t { EventTime::Zoned(dt) => json!(zoned_offset(dt)), _ => Value::Null },
            "epochMs": t.ordering_ms(v),
        })
    });
}

#[test]
fn projections() {
    check("projections", |input| {
        let v = viewer(input);
        let t = time(&input["time"]);
        json!({
            "instantMs": t.ordering_ms(v),
            "viewerZoned": temporal_zoned(&t.to_viewer_zoned(v)),
            "dateInViewerZone": t.date_in_viewer_zone(v).to_string(),
            "isAllDay": t.is_all_day(),
        })
    });
}

#[test]
fn same() {
    check("same", |input| {
        let v = viewer(input);
        let (a, b) = (time(&input["a"]), time(&input["b"]));
        json!({ "isSameDay": a.is_same_day(&b, v), "isSameEventTime": a == b })
    });
}

#[test]
fn date_info() {
    check("date_info", |input| {
        let v = viewer(input);
        let start = time(&input["start"]);
        let info = EventDateInfo::compute(&start, &time(&input["end"]), v);
        let days: Vec<i32> = info.occupied_days().collect();
        json!({
            "dateInfo": info,
            "coversFullDay": days.iter().map(|d| info.covers_full_day(&start, *d)).collect::<Vec<_>>(),
            "occupiedDays": days,
        })
    });
}

#[test]
fn days() {
    use rencal_time::FirstDayOfWeek::{Monday, Sunday};
    check("days", |input| {
        let d = date(&input["date"]);
        let key = epoch_day(d);
        json!({
            "epochDay": key,
            "fromEpochDay": date_from_epoch_day(key).to_string(),
            "dateKeyFromEpochDay": day::date_key_from_epoch_day(key),
            "dayOfWeek": day::day_of_week(d),
            "startOfWeek": {
                "monday": start_of_week(d, Monday).to_string(),
                "sunday": start_of_week(d, Sunday).to_string(),
            },
            "isoWeekNumber": {
                "monday": iso_week_number(d, Monday),
                "sunday": iso_week_number(d, Sunday),
            },
        })
    });
}

fn date_labels(d: NaiveDate, today: NaiveDate) -> Map<String, Value> {
    let mut out = Map::new();
    out.insert("formatDateKey".into(), json!(display::format_date_key(d)));
    out.insert(
        "formatShortDate".into(),
        json!(display::format_short_date(d, today)),
    );
    out.insert(
        "formatLongDate".into(),
        json!(display::format_long_date(d, today)),
    );
    out.insert(
        "getRelativeDayLabel".into(),
        json!(display::relative_day_label(d, today)),
    );
    out
}

#[test]
fn display() {
    check("display", |input| match input["fn"].as_str().unwrap() {
        "formatTime" => {
            let v = viewer(input);
            let t = time(&input["time"]);
            json!({
                "24h": display::format_time(&t, TimeFormat::H24, v),
                "12h": display::format_time(&t, TimeFormat::H12, v),
            })
        }
        "dateLabels" => {
            let v = viewer(input);
            let d = time(&input["time"]).date_in_viewer_zone(v);
            Value::Object(date_labels(d, now_today(input, v)))
        }
        "formatWallclockTime" => {
            let (h, m) = (
                input["hour"].as_u64().unwrap() as u32,
                input["minute"].as_u64().unwrap() as u32,
            );
            json!({
                "24h": display::format_wallclock_time(h, m, TimeFormat::H24),
                "12h": display::format_wallclock_time(h, m, TimeFormat::H12),
            })
        }
        "plainDateLabels" => {
            let v = viewer(input);
            let d = date(&input["date"]);
            let today = now_today(input, v);
            let mut out = date_labels(d, today);
            out.insert(
                "formatDayMonth".into(),
                json!(display::format_day_month(d, today)),
            );
            out.insert(
                "weekday".into(),
                json!({
                    "short": display::format_weekday(d, DatePartStyle::Short),
                    "long": display::format_weekday(d, DatePartStyle::Long),
                }),
            );
            out.insert(
                "month".into(),
                json!({
                    "short": display::format_month(d, DatePartStyle::Short),
                    "long": display::format_month(d, DatePartStyle::Long),
                }),
            );
            Value::Object(out)
        }
        other => panic!("unknown fn {other}"),
    });
}

#[test]
fn edits() {
    check("edits", |input| {
        let v = viewer(input);
        let t = time(&input["time"]);
        let (hour, minute) = t.wallclock_time(v);
        json!({
            "addMinutes": map([-1440, -90, -30, 15, 60, 90, 720, 1440, 2880], |m| rpc(&t.add_minutes(*m))),
            "addDays": map([-7, -1, 1, 2, 7, 30], |d| rpc(&t.add_days(*d))),
            "toAllDay": rpc(&t.to_all_day(v)),
            "toTimedAtStartOfDay": rpc(&t.to_timed_at_start_of_day(v)),
            "withViewerZone": rpc(&t.with_viewer_zone(v)),
            "dateInEventZone": t.date_in_event_zone(v).to_string(),
            "wallclockTime": { "hour": hour, "minute": minute },
            "withWallclockTime": map(["0:0", "2:30", "9:15", "23:45"], |key| {
                let (h, m) = key.split_once(':').unwrap();
                rpc(&t.with_wallclock_time(h.parse().unwrap(), m.parse().unwrap(), v))
            }),
            "withEventDate": map(
                ["2026-03-29", "2026-10-25", "2026-03-08", "2026-11-01", "2024-02-29"],
                |d| rpc(&t.with_event_date(d.parse().unwrap(), v)),
            ),
            "eventTzid": t.event_tz(v).name(),
            "withEventTimeZone": map(
                ["UTC", "Europe/Berlin", "America/New_York", "Asia/Kolkata"],
                |z| rpc(&t.with_event_time_zone(parse_tz(z).unwrap(), v)),
            ),
        })
    });
}

#[test]
fn constructors() {
    check("constructors", |input| {
        let v = viewer(input);
        match input["fn"].as_str().unwrap() {
            "atTime" => rpc(&at_time(
                date(&input["date"]),
                input["hour"].as_u64().unwrap() as u32,
                input["minute"].as_u64().unwrap() as u32,
                v,
            )),
            "fromDate" => {
                let c = &input["localComponents"];
                let n = |k: &str| c[k].as_u64().unwrap() as u32;
                let wallclock = NaiveDate::from_ymd_opt(
                    c["year"].as_i64().unwrap() as i32,
                    n("month"),
                    n("day"),
                )
                .unwrap()
                .and_hms_opt(n("hour"), n("minute"), 0)
                .unwrap();
                rpc(&EventTime::zoned(wallclock, v))
            }
            other => panic!("unknown fn {other}"),
        }
    });
}

#[test]
fn ranges() {
    check("ranges", |input| {
        let v = viewer(input);
        let range = EventTimeRange::new(time(&input["start"]), time(&input["end"]));
        let hm = |key: &&str| {
            let (h, m) = key.split_once(':').unwrap();
            (h.parse().unwrap(), m.parse().unwrap())
        };
        json!({
            "normalizeAllDayRange": rpc_range(&EventTimeRange::normalize_all_day(range.start.clone(), range.end.clone(), v)),
            "withRangeStartWallclockTime": map(["8:0", "2:30", "23:30"], |k| {
                let (h, m) = hm(k);
                rpc_range(&range.with_start_wallclock_time(h, m, v))
            }),
            "withRangeEndWallclockTime": map(["0:0", "8:0", "17:45"], |k| {
                let (h, m) = hm(k);
                rpc_range(&range.with_end_wallclock_time(h, m, v))
            }),
            "withRangeStartDate": map(["2026-06-01", "2026-03-29", "2026-11-01", "2027-01-01"], |d| {
                rpc_range(&range.with_start_date(d.parse().unwrap(), v))
            }),
            "withRangeDisplayEndDate": map(["2026-06-10", "2026-06-15", "2026-06-20", "2026-10-25"], |d| {
                rpc_range(&range.with_display_end_date(d.parse().unwrap(), v))
            }),
            "displayEndDate": range.display_end_date(v).to_string(),
            "shouldShowDisplayEndDate": range.should_show_display_end_date(v),
            "withRangeTimeZone": map(["UTC", "America/New_York", "Asia/Kolkata"], |z| {
                rpc_range(&range.with_time_zone(parse_tz(z).unwrap(), v))
            }),
            "withRangeViewerZone": rpc_range(&range.with_viewer_zone(v)),
        })
    });
}

#[test]
fn timezones() {
    check("timezones", |input| {
        let tzid = input["tzid"].as_str().unwrap();
        match input["fn"].as_str().unwrap() {
            "timeZoneCity" => json!(time_zone_city(tzid)),
            "timeZoneOffsetLabel" => json!(time_zone_offset_label(
                parse_tz(tzid).unwrap(),
                &time(&input["at"]),
                viewer(input),
            )),
            other => panic!("unknown fn {other}"),
        }
    });
}

#[test]
fn load_ranges() {
    check("load_ranges", |input| {
        let range = start_range_for_date(date(&input["date"]));
        json!({
            "start": range.start.to_string(),
            "end": range.end.to_string(),
            "monthsToLoad": rencal_time::event::MONTHS_TO_LOAD,
        })
    });
}
