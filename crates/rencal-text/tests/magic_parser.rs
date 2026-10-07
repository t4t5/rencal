//! The magic parser against the golden fixtures from the TS implementation
//! (`scripts/fixtures/text.fixtures.ts` → `magic_parser.json`), plus the port
//! of `src/lib/magic-parser.test.ts`.

use chrono::{NaiveDate, NaiveDateTime};
use rencal_text::magic::{parse_event_text, segment_event_text};
use rencal_time::{EventTime, Tz, parse_tz};
use serde_json::{Value, json};

fn load_cases() -> Vec<Value> {
    let path = format!(
        "{}/tests/fixtures/magic_parser.json",
        env!("CARGO_MANIFEST_DIR")
    );
    let json: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    json["cases"].as_array().unwrap().clone()
}

fn wallclock(s: &str) -> NaiveDateTime {
    NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S").unwrap()
}

/// UTF-16 length of `s`, the unit the fixture offsets use.
fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// Rebuild a case's `output` the way the fixture generator serialized it.
fn run_case(input: &Value) -> Value {
    let text = input["text"].as_str().unwrap();
    let now = wallclock(input["referenceWallclock"].as_str().unwrap());
    let viewer: Tz = parse_tz(input["viewerTz"].as_str().unwrap()).unwrap();

    let parsed = parse_event_text(text, now, viewer);
    let segments: Vec<Value> = segment_event_text(text, now, viewer)
        .into_iter()
        .map(|segment| {
            let start = utf16_len(&text[..segment.range.start]);
            let end = utf16_len(&text[..segment.range.end]);
            json!({
                "text": &text[segment.range],
                "parsed": segment.parsed,
                "start": start,
                "end": end,
            })
        })
        .collect();
    json!({
        "summary": parsed.summary,
        "start": parsed.time.as_ref().map(|t| &t.start),
        "end": parsed.time.as_ref().map(|t| &t.end),
        "recurrence": parsed.recurrence,
        "location": parsed.location,
        "chronoMatchText": parsed.date_text,
        "segments": segments,
    })
}

#[test]
fn magic_parser_fixtures() {
    let cases = load_cases();
    assert!(cases.len() >= 200);
    let failures: Vec<String> = cases
        .iter()
        .filter_map(|case| {
            let actual = run_case(&case["input"]);
            (actual != case["output"]).then(|| {
                format!(
                    "{}\n  expected: {}\n  actual:   {}",
                    case["name"], case["output"], actual
                )
            })
        })
        .collect();
    assert!(
        failures.is_empty(),
        "{}/{} cases differ:\n{}",
        failures.len(),
        cases.len(),
        failures.join("\n")
    );
}

// ---------------------------------------------------------------- magic-parser.test.ts

#[test]
fn parses_a_multi_day_range() {
    let berlin: Tz = "Europe/Berlin".parse().unwrap();
    let now = NaiveDate::from_ymd_opt(2026, 4, 20)
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap();
    let result = parse_event_text("Holiday from june 15 to june 18", now, berlin);

    assert_eq!(result.summary, "Holiday");
    assert_eq!(result.recurrence, None);
    assert_eq!(result.location, None);
    assert_eq!(result.date_text.as_deref(), Some("june 15 to june 18"));

    let time = result.time.expect("a date range");
    let date = |y, m, d| EventTime::Date(NaiveDate::from_ymd_opt(y, m, d).unwrap());
    assert_eq!(time.start, date(2026, 6, 15));
    // End is exclusive (iCal convention): June 18 inclusive → June 19.
    assert_eq!(time.end, date(2026, 6, 19));
}
