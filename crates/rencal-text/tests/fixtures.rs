//! Golden fixtures from the TS implementation (`scripts/fixtures/text.fixtures.ts`),
//! except the magic parser's (`tests/magic_parser.rs`). Each test rebuilds a
//! case's `output` from its `input` and compares JSON.

use chrono::{DateTime, NaiveDateTime, Utc};
use rencal_text::calendar_groups::{
    format_group_name, group_options, normalize_calendar_groups, stored_active_group,
    visible_calendar_slugs,
};
use rencal_text::conference::{
    EventLinks, JOIN_LEAD_MINUTES, calendar_conference_provider, conference_for_calendar,
    detect_conference, is_within_join_window,
};
use rencal_text::contacts::{
    Contact, DEFAULT_SUGGESTION_LIMIT, is_valid_contact_email, suggest_contacts,
};
use rencal_text::event_url::{find_urls, to_openable_url};
use rencal_text::recurrence::{
    RRule, RRuleSet, anchor_range_to_recurring_master, repeat_presets, with_nearest_occurrence,
};
use rencal_text::search::prepare_search_results;
use rencal_time::event::{EventConference, Recurrence};
use rencal_time::{
    Calendar, CalendarEvent, EventDateInfo, EventTime, EventTimeRange, Tz, parse_tz,
};
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

fn load(name: &str) -> Vec<Value> {
    let path = format!("{}/tests/fixtures/{name}.json", env!("CARGO_MANIFEST_DIR"));
    let json: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    json["cases"].as_array().unwrap().clone()
}

/// Run every case through `f(input, case name)` and fail with the mismatching
/// cases.
fn check(name: &str, f: impl Fn(&Value, &str) -> Value) {
    let cases = load(name);
    assert!(!cases.is_empty());
    let mut failures = Vec::new();
    for case in &cases {
        let actual = f(&case["input"], case["name"].as_str().unwrap());
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

fn de<T: DeserializeOwned>(value: &Value) -> T {
    serde_json::from_value(value.clone()).unwrap()
}

fn str_of(value: &Value) -> Option<&str> {
    value.as_str()
}

fn viewer(input: &Value) -> Tz {
    parse_tz(input["viewerTz"].as_str().unwrap()).unwrap()
}

fn rpc(t: &EventTime) -> Value {
    serde_json::to_value(t).unwrap()
}

/// `shared.ts → makeEvent`: summary defaults to the id, calendar to "cal".
fn make_event(spec: &Value, viewer: Tz) -> CalendarEvent {
    let mut spec = spec.clone();
    let obj = spec.as_object_mut().unwrap();
    if !obj.contains_key("summary") {
        obj.insert("summary".into(), obj["id"].clone());
    }
    obj.entry("calendar_slug").or_insert(json!("cal"));
    de::<CalendarEvent>(&spec).with_viewer(viewer)
}

fn wallclock(s: &str) -> NaiveDateTime {
    ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M"]
        .iter()
        .find_map(|f| NaiveDateTime::parse_from_str(s, f).ok())
        .unwrap()
}

#[test]
fn recurrence() {
    check("recurrence", |input, name| {
        match input["fn"].as_str().unwrap() {
            "createRRuleWithDtstart" => {
                let rule: RRule = input["rrule"].as_str().unwrap().parse().unwrap();
                let anchored = rule.anchor(wallclock(input["dtstart"].as_str().unwrap()));
                let first: Vec<String> = anchored
                    .first(8)
                    .unwrap()
                    .iter()
                    .map(|d| d.format("%Y-%m-%dT%H:%M").to_string())
                    .collect();
                json!({ "toString": anchored.to_string(), "first": first })
            }
            "toText" => {
                let rule: RRule = input["rrule"].as_str().unwrap().parse().unwrap();
                json!(rule.to_text())
            }
            "RepeatSelect preset" => {
                // The presets share one input; the case name carries the value.
                let preset = repeat_presets()
                    .into_iter()
                    .find(|p| name == format!("preset {}", p.rule))
                    .expect("a preset for every case");
                json!({ "value": preset.rule.to_string(), "text": preset.rule.to_text() })
            }
            "recurrenceToRRuleSet+rruleToRecurrence" => {
                let v = viewer(input);
                let set =
                    RRuleSet::from_recurrence(&de::<Recurrence>(&input["recurrence"]), v).unwrap();
                json!({
                    "rruleSet": set.to_string(),
                    "recurrence": serde_json::to_value(set.to_recurrence(v)).unwrap(),
                })
            }
            "withNearestOccurrence" => {
                let v = viewer(input);
                let event = make_event(&input["event"], v);
                let shifted =
                    with_nearest_occurrence(event, wallclock(input["now"].as_str().unwrap()), v);
                json!({ "start": rpc(&shifted.start), "end": rpc(&shifted.end) })
            }
            "anchorRangeToRecurringMaster" => {
                let v = viewer(input);
                let current: EventTimeRange = de(&input["current"]);
                let master: EventTime = de(&input["masterStart"]);
                serde_json::to_value(anchor_range_to_recurring_master(&current, &master, v))
                    .unwrap()
            }
            other => panic!("unknown fn {other}"),
        }
    });
}

fn calendar(provider: &Value) -> Option<Calendar> {
    match provider.as_str() {
        Some("<undefined calendar>") => None,
        provider => Some(Calendar {
            slug: "c".into(),
            provider: provider.map(str::to_owned),
            ..Calendar::default()
        }),
    }
}

#[test]
fn conference() {
    check("conference", |input, _| {
        match input["fn"].as_str().unwrap() {
            "detectConference" => {
                serde_json::to_value(detect_conference(str_of(&input["text"]))).unwrap()
            }
            "hasVideoMeeting+getMeetingUrl" => {
                let conference: Option<EventConference> = de(&input["conference"]);
                let links = EventLinks {
                    location: str_of(&input["location"]),
                    conference: conference.as_ref(),
                    ..EventLinks::default()
                };
                json!({ "hasVideoMeeting": links.has_video_meeting(), "getMeetingUrl": links.meeting_url() })
            }
            "isWithinJoinWindow" => {
                let info = EventDateInfo {
                    start_ms: input["startMs"].as_i64().unwrap(),
                    end_ms: input["endMs"].as_i64().unwrap(),
                    ..EventDateInfo::default()
                };
                json!(is_within_join_window(
                    &info,
                    input["nowMs"].as_i64().unwrap()
                ))
            }
            "conferenceForCalendar" => {
                let calendar = calendar(&input["provider"]);
                let conference: Option<EventConference> = de(&input["conference"]);
                json!({
                    "provider": calendar_conference_provider(calendar.as_ref()),
                    "conference": conference_for_calendar(conference, calendar.as_ref()),
                })
            }
            "JOIN_LEAD_MINUTES" => json!(JOIN_LEAD_MINUTES),
            other => panic!("unknown fn {other}"),
        }
    });
}

#[test]
fn event_url() {
    check("event_url", |input, _| {
        match input["fn"].as_str().unwrap() {
            "findUrls" => json!(find_urls(str_of(&input["text"]))),
            "toOpenableUrl" => json!(to_openable_url(input["url"].as_str().unwrap())),
            "detectEventUrl" => {
                let event = &input["event"];
                let conference: Option<EventConference> = de(&event["conference"]);
                let links = EventLinks {
                    url: str_of(&event["url"]),
                    description: str_of(&event["description"]),
                    location: str_of(&event["location"]),
                    conference: conference.as_ref(),
                };
                serde_json::to_value(links.detect_url()).unwrap()
            }
            other => panic!("unknown fn {other}"),
        }
    });
}

#[test]
fn contact_suggestions() {
    let cases = load("contact_suggestions");
    let contacts: Vec<Contact> = de(&cases[0]["output"]);
    check("contact_suggestions", |input, _| {
        match input["fn"].as_str().unwrap() {
            "contacts" => serde_json::to_value(&contacts).unwrap(),
            "suggestContacts" => {
                let exclude: Vec<String> = de(&input["excludeEmails"]);
                let limit = input["limit"]
                    .as_u64()
                    .map_or(DEFAULT_SUGGESTION_LIMIT, |l| l as usize);
                let found =
                    suggest_contacts(&contacts, input["query"].as_str().unwrap(), &exclude, limit);
                json!(found.iter().map(|c| &c.email).collect::<Vec<_>>())
            }
            "isValidContactEmail" => {
                json!(is_valid_contact_email(input["email"].as_str().unwrap()))
            }
            other => panic!("unknown fn {other}"),
        }
    });
}

#[test]
fn calendar_groups() {
    check("calendar_groups", |input, _| {
        match input["fn"].as_str().unwrap() {
            "normalize+options+visible" => {
                let raw: Vec<(String, Option<Vec<String>>)> = input["groups"]
                    .as_object()
                    .unwrap()
                    .iter()
                    .map(|(k, v)| (k.clone(), serde_json::from_value(v.clone()).ok()))
                    .collect();
                let groups = normalize_calendar_groups(raw);
                let calendars: Vec<Calendar> = input["calendars"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|slug| Calendar {
                        slug: slug.as_str().unwrap().into(),
                        ..Calendar::default()
                    })
                    .collect();
                let visible: serde_json::Map<String, Value> =
                    ["default", "work", "home", "alpha", "Zeta", "unknown"]
                        .into_iter()
                        .map(|g| {
                            (
                                g.to_owned(),
                                json!(visible_calendar_slugs(&calendars, &groups, g)),
                            )
                        })
                        .collect();
                json!({ "normalized": groups, "options": group_options(&groups), "visible": visible })
            }
            "formatGroupName" => json!(format_group_name(input["name"].as_str().unwrap())),
            "getStoredActiveGroup" => json!(stored_active_group(str_of(&input["stored"]))),
            other => panic!("unknown fn {other}"),
        }
    });
}

#[test]
fn search_results() {
    check("search_results", |input, _| {
        let v = viewer(input);
        let now: DateTime<Utc> = input["now"].as_str().unwrap().parse().unwrap();
        let events = input["events"]
            .as_array()
            .unwrap()
            .iter()
            .map(|spec| make_event(spec, v))
            .collect();
        let results = prepare_search_results(events, now, v);
        json!(
            results
                .iter()
                .map(|e| json!({ "id": e.id, "start": rpc(&e.start), "end": rpc(&e.end) }))
                .collect::<Vec<_>>()
        )
    });
}
