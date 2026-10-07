//! Golden fixtures from the TS implementation (`scripts/fixtures/layout.fixtures.ts`).
//! Each test rebuilds a case's `output` from its `input` and compares JSON.
//!
//! The Rust API differs from the TS one in a few representational ways; the
//! conversions back to the fixture shape live here: 0-based columns (TS: 1-based
//! CSS grid lines), lane counts (TS: max lane, -1 when empty), integer minutes
//! (TS: percentages of the day), event indexes (TS: event objects) and pixel
//! rectangles (TS: CSS `calc()` strings, evaluated here with sample metrics).

use chrono::{Days, NaiveDate};
use rencal_layout::drag::{
    AUTOSCROLL_EDGE_PX, CreateSelection, DRAG_SNAP_MINUTES, DRAG_THRESHOLD_PX, DropHit, DropZone,
    clamp_point_to_rect, compute_drop_range, day_selection_for_pointer, day_selection_range,
    edge_scroll_delta, grab_for, make_drag_preview, minutes_at_y, selection_for_pointer,
    selection_range,
};
use rencal_layout::week_snap::{
    WheelSample, classify_gesture, decay_rate, pick_fling_target, pick_snap_target,
    predict_fling_end,
};
use rencal_layout::{
    AllDayLaneItem, AllDaySpan, DisplayMode, LANE_GAP, MonthRowMetrics, Point, Rect,
    all_day_bar_rect, assign_all_day_lanes, day_range_layout, month_event_layout, month_grid,
    month_grid_bounds, reserved_all_day_height,
};
use rencal_time::{CalendarEvent, EventTimeRange, FirstDayOfWeek, Tz, epoch_day, parse_tz};
use serde_json::{Value, json};

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

fn date(value: &Value) -> NaiveDate {
    value.as_str().unwrap().parse().unwrap()
}

fn f64_of(value: &Value) -> f64 {
    value.as_f64().unwrap()
}

fn f32_of(value: &Value) -> f32 {
    f64_of(value) as f32
}

fn first_day_of_week(value: &Value) -> FirstDayOfWeek {
    serde_json::from_value(value.clone()).unwrap()
}

/// A JSON number as JS would print it: integral values as integers.
fn num(x: f64) -> Value {
    if x.fract() == 0.0 && x.abs() < 9.0e15 {
        json!(x as i64)
    } else {
        json!(x)
    }
}

/// `shared.ts → makeEvent`: the summary defaults to the id, the calendar to "cal".
fn make_event(spec: &Value, viewer: Tz) -> CalendarEvent {
    let mut spec = spec.as_object().unwrap().clone();
    let id = spec["id"].clone();
    spec.entry("summary").or_insert(id);
    spec.entry("calendar_slug").or_insert(json!("cal"));
    serde_json::from_value::<CalendarEvent>(Value::Object(spec))
        .unwrap()
        .with_viewer(viewer)
}

fn make_events(input: &Value, viewer: Tz) -> Vec<CalendarEvent> {
    input["events"]
        .as_array()
        .unwrap()
        .iter()
        .map(|spec| make_event(spec, viewer))
        .collect()
}

fn rpc_range(range: &EventTimeRange) -> Value {
    json!({
        "start": serde_json::to_value(&range.start).unwrap(),
        "end": serde_json::to_value(&range.end).unwrap(),
    })
}

fn span_json(span: &AllDaySpan) -> Value {
    json!({
        "startCol": span.start_col + 1,
        "endCol": span.end_col + 1,
        "isStart": span.is_start,
        "isEnd": span.is_end,
    })
}

fn all_day_out(items: &[AllDayLaneItem], events: &[CalendarEvent]) -> Value {
    items
        .iter()
        .map(|item| {
            let mut out = span_json(&item.span);
            out["eventId"] = json!(events[item.event].id);
            out["lane"] = json!(item.lane);
            out
        })
        .collect()
}

fn max_lane(lanes: usize) -> i64 {
    lanes as i64 - 1
}

#[test]
fn week_layout() {
    check("week_layout", |input| {
        let v = viewer(input);
        let events = make_events(input, v);
        let start = date(&input["days"]["start"]);
        let count = input["days"]["count"].as_u64().unwrap() as usize;
        let layout = day_range_layout(&events, epoch_day(start), count);

        let percent = |minutes: i32| num(f64::from(minutes) / 1440.0 * 100.0);
        let mut timed_by_day = serde_json::Map::new();
        for (i, day) in layout.timed_by_day.iter().enumerate() {
            let key = (start + Days::new(i as u64)).to_string();
            let items = day
                .iter()
                .map(|p| {
                    json!({
                        "eventId": events[p.event].id,
                        "top": percent(p.start_minutes),
                        "height": percent(p.duration_minutes),
                        "column": p.column,
                        "totalColumns": p.total_columns,
                        "durationMinutes": p.duration_minutes,
                        "displayMode": match p.display_mode {
                            DisplayMode::Xs => "xs",
                            DisplayMode::Sm => "sm",
                            DisplayMode::Md => "md",
                            DisplayMode::Lg => "lg",
                        },
                    })
                })
                .collect();
            timed_by_day.insert(key, items);
        }
        json!({
            "allDayItems": all_day_out(&layout.all_day_items, &events),
            "maxAllDayLane": max_lane(layout.all_day_lanes),
            "timedByDay": timed_by_day,
        })
    });
}

#[test]
fn month_grid_cases() {
    check("month_grid", |input| {
        let (start, end) = (date(&input["rangeStart"]), date(&input["rangeEnd"]));
        let first_day = first_day_of_week(&input["firstDayOfWeek"]);
        let grid = month_grid(start, end, first_day, date(&input["today"]));
        assert_eq!(
            month_grid_bounds(start, end, first_day),
            (grid.grid_start, grid.grid_end)
        );
        let weeks: Vec<Value> = grid
            .weeks
            .iter()
            .map(|week| {
                week.iter()
                    .map(|d| {
                        assert_eq!(d.epoch_day, epoch_day(d.date));
                        json!({
                            "dateKey": d.date.to_string(),
                            "isToday": d.is_today,
                            "isWeekend": d.is_weekend,
                        })
                    })
                    .collect()
            })
            .collect();
        json!({
            "gridStart": grid.grid_start.to_string(),
            "gridEnd": grid.grid_end.to_string(),
            "weeks": weeks,
        })
    });
}

#[test]
fn month_layout() {
    check("month_layout", |input| {
        let v = viewer(input);
        let events = make_events(input, v);
        let grid = month_grid(
            date(&input["rangeStart"]),
            date(&input["rangeEnd"]),
            first_day_of_week(&input["firstDayOfWeek"]),
            date(&input["today"]),
        );
        let layouts = month_event_layout(&events, grid.weeks.iter().map(|w| w[0].epoch_day));
        layouts
            .iter()
            .zip(&grid.weeks)
            .map(|(week, days)| {
                json!({
                    "weekStart": days[0].date.to_string(),
                    "allDayItems": all_day_out(&week.all_day_items, &events),
                    "maxLane": max_lane(week.lanes),
                    "timedByCol": week.timed_by_col.iter().map(|col| {
                        col.iter().map(|&i| events[i].id.as_str()).collect::<Vec<_>>()
                    }).collect::<Vec<_>>(),
                })
            })
            .collect()
    });
}

#[test]
fn all_day_lanes() {
    check("all_day_lanes", |input| {
        let i32_of = |key: &str| input[key].as_i64().unwrap() as i32;
        match input["fn"].as_str().unwrap() {
            "clipSpanToRange" => AllDaySpan::clip(
                i32_of("firstDay"),
                i32_of("lastDay"),
                i32_of("rangeFirstDay"),
                i32_of("rangeLastDay"),
            )
            .map_or(Value::Null, |span| span_json(&span)),
            "assignAllDayLanes" => {
                let mut items: Vec<AllDayLaneItem> = input["spans"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .enumerate()
                    .map(|(index, span)| AllDayLaneItem {
                        event: index,
                        span: AllDaySpan {
                            start_col: span["startCol"].as_u64().unwrap() as usize - 1,
                            end_col: span["endCol"].as_u64().unwrap() as usize - 1,
                            is_start: true,
                            is_end: true,
                        },
                        lane: 0,
                    })
                    .collect();
                let columns = input["columnCount"].as_u64().unwrap() as usize;
                let lanes = assign_all_day_lanes(&mut items, columns);
                json!({
                    "maxLane": max_lane(lanes),
                    "order": items.iter().map(|item| json!({ "index": item.event, "lane": item.lane })).collect::<Vec<_>>(),
                })
            }
            other => panic!("unknown fn {other}"),
        }
    });
}

/// Sample metrics for evaluating the TS `calc()` strings.
const METRICS: MonthRowMetrics = MonthRowMetrics {
    row_width: 700.0,
    lane_height: 20.0,
    padding_inline: 6.0,
};

/// Evaluate the `calc()` expressions `lane-geometry.ts` produced: sums and
/// differences of products, with `%` relative to the row width.
fn eval_css(css: &str) -> f32 {
    let body = css
        .strip_prefix("calc(")
        .and_then(|s| s.strip_suffix(')'))
        .unwrap_or(css);
    let factor = |token: &str| -> f32 {
        match token {
            "var(--lane-height)" => METRICS.lane_height,
            "var(--month-padding-inline)" => METRICS.padding_inline,
            _ if token.ends_with("px") => token.trim_end_matches("px").parse().unwrap(),
            _ if token.ends_with('%') => {
                token.trim_end_matches('%').parse::<f32>().unwrap() / 100.0 * METRICS.row_width
            }
            _ => token.parse().unwrap(),
        }
    };
    let term = |t: &str| t.split(" * ").map(factor).product::<f32>();
    // Terms are separated by " + " / " - "; a bare "-2px" is a negative factor.
    let mut total = 0.0;
    let mut sign = 1.0;
    let mut rest = body;
    loop {
        let next = [" + ", " - "]
            .into_iter()
            .filter_map(|op| rest.find(op).map(|at| (at, op)))
            .min();
        let Some((at, op)) = next else {
            return total + sign * term(rest);
        };
        total += sign * term(&rest[..at]);
        sign = if op == " + " { 1.0 } else { -1.0 };
        rest = &rest[at + op.len()..];
    }
}

#[test]
fn lane_geometry() {
    let close = |a: f32, b: f32| (a - b).abs() < 1e-3;
    for case in load("lane_geometry") {
        let input = &case["input"];
        let output = &case["output"];
        let name = case["name"].as_str().unwrap();
        match input["fn"].as_str().unwrap() {
            "LANE_GAP" => assert_eq!(f64::from(LANE_GAP), f64_of(output), "{name}"),
            "allDayBarStyle" => {
                let s = &input["span"];
                let span = AllDaySpan {
                    start_col: s["startCol"].as_u64().unwrap() as usize - 1,
                    end_col: s["endCol"].as_u64().unwrap() as usize - 1,
                    is_start: s["isStart"].as_bool().unwrap(),
                    is_end: s["isEnd"].as_bool().unwrap(),
                };
                let lane = input["lane"].as_u64().unwrap() as usize;
                let rect = all_day_bar_rect(&span, lane, &METRICS);
                let css = |key: &str| eval_css(output[key].as_str().unwrap());
                let expected = Rect {
                    left: css("left"),
                    top: css("top"),
                    right: METRICS.row_width - css("right"),
                    bottom: css("top") + css("height"),
                };
                assert!(
                    close(rect.left, expected.left)
                        && close(rect.top, expected.top)
                        && close(rect.right, expected.right)
                        && close(rect.bottom, expected.bottom),
                    "{name}: expected {expected:?}, got {rect:?}"
                );
            }
            "reservedAllDayHeight" => {
                let lanes = input["lanes"].as_u64().unwrap() as usize;
                let actual = reserved_all_day_height(lanes, METRICS.lane_height);
                let expected = output.as_str().map(eval_css);
                assert_eq!(actual.is_some(), expected.is_some(), "{name}");
                if let (Some(a), Some(e)) = (actual, expected) {
                    assert!(close(a, e), "{name}: expected {e}, got {a}");
                }
            }
            other => panic!("unknown fn {other}"),
        }
    }
}

fn drop_hit(value: &Value) -> DropHit {
    DropHit {
        zone: match value["zone"].as_str().unwrap() {
            "day" => DropZone::Day,
            "all-day" => DropZone::AllDay,
            "timed" => DropZone::Timed,
            other => panic!("unknown zone {other}"),
        },
        day: date(&value["day"]),
        minutes: value["minutes"].as_f64(),
    }
}

fn rect_of(value: &Value) -> Rect {
    Rect {
        left: f32_of(&value["left"]),
        top: f32_of(&value["top"]),
        right: f32_of(&value["right"]),
        bottom: f32_of(&value["bottom"]),
    }
}

fn point_json(point: Point, x: &str, y: &str) -> Value {
    let mut out = serde_json::Map::new();
    out.insert(x.into(), num(f64::from(point.x)));
    out.insert(y.into(), num(f64::from(point.y)));
    Value::Object(out)
}

#[test]
fn event_drag() {
    check("event_drag", |input| match input["fn"].as_str().unwrap() {
        "computeDropRange" => {
            let v = viewer(input);
            let event = make_event(&input["event"], v);
            let grab_hit = (!input["grabHit"].is_null()).then(|| drop_hit(&input["grabHit"]));
            let grab = grab_for(&event, grab_hit.as_ref());
            let mut drops = serde_json::Map::new();
            for hit in input["hits"].as_array().unwrap() {
                let key = format!(
                    "{} {} {}",
                    hit["zone"].as_str().unwrap(),
                    hit["day"].as_str().unwrap(),
                    hit["minutes"]
                );
                let range = compute_drop_range(&event, &drop_hit(hit), &grab);
                drops.insert(key, range.as_ref().map_or(Value::Null, rpc_range));
            }
            let preview = make_drag_preview(
                &event,
                &EventTimeRange::new(event.start.clone(), event.end.clone()),
                v,
            );
            assert_eq!(preview.date_info, event.date_info);
            json!({
                "grab": { "dayOffset": grab.day_offset, "minuteOffset": num(grab.minute_offset) },
                "isSpanning": event.is_spanning(),
                "previewId": preview.id,
                "drops": drops,
            })
        }
        "edgeScrollDelta" => {
            let pointer = Point {
                x: f32_of(&input["x"]),
                y: f32_of(&input["y"]),
            };
            let axes = &input["axes"];
            let delta = edge_scroll_delta(
                &rect_of(&input["rect"]),
                pointer,
                axes["x"].as_bool().unwrap(),
                axes["y"].as_bool().unwrap(),
            );
            point_json(delta, "dx", "dy")
        }
        "constants" => json!({
            "DRAG_SNAP_MINUTES": DRAG_SNAP_MINUTES,
            "DRAG_THRESHOLD_PX": num(f64::from(DRAG_THRESHOLD_PX)),
            "AUTOSCROLL_EDGE_PX": num(f64::from(AUTOSCROLL_EDGE_PX)),
        }),
        other => panic!("unknown fn {other}"),
    });
}

#[test]
fn drag_to_create() {
    check("drag_to_create", |input| {
        match input["fn"].as_str().unwrap() {
            "daySelectionForPointer+daySelectionRange" => {
                let selection =
                    day_selection_for_pointer(date(&input["anchor"]), date(&input["pointer"]));
                json!({
                    "selection": {
                        "start": selection.start.to_string(),
                        "end": selection.end.to_string(),
                    },
                    "range": rpc_range(&day_selection_range(&selection)),
                })
            }
            "selectionForPointer" => {
                let selection = selection_for_pointer(
                    f64_of(&input["anchorMinutes"]),
                    f64_of(&input["pointerMinutes"]),
                );
                json!({ "startMinutes": selection.start_minutes, "endMinutes": selection.end_minutes })
            }
            "selectionRange" => {
                let s = &input["selection"];
                let selection = CreateSelection {
                    start_minutes: s["startMinutes"].as_i64().unwrap() as i32,
                    end_minutes: s["endMinutes"].as_i64().unwrap() as i32,
                };
                rpc_range(&selection_range(
                    date(&input["day"]),
                    &selection,
                    viewer(input),
                ))
            }
            "minutesAtY" => {
                let rect = &input["rect"];
                num(minutes_at_y(
                    f32_of(&rect["top"]),
                    f32_of(&rect["height"]),
                    f32_of(&input["y"]),
                ))
            }
            "clampPointToRect" => {
                let point = Point {
                    x: f32_of(&input["x"]),
                    y: f32_of(&input["y"]),
                };
                point_json(
                    clamp_point_to_rect(&rect_of(&input["rect"]), point),
                    "x",
                    "y",
                )
            }
            other => panic!("unknown fn {other}"),
        }
    });
}

#[test]
fn week_snap() {
    check("week_snap", |input| {
        let n = |key: &str| f64_of(&input[key]);
        match input["fn"].as_str().unwrap() {
            "predictFlingEnd" => num(predict_fling_end(n("from"), n("velocity"), n("maxOffset"))),
            "pickSnapTarget" => num(pick_snap_target(
                n("offset"),
                n("rowHeight"),
                n("maxOffset"),
            )),
            "pickFlingTarget" => {
                pick_fling_target(n("from"), n("velocity"), n("rowHeight"), n("maxOffset"))
                    .map_or(Value::Null, num)
            }
            "classifyGesture" => {
                let log: Vec<WheelSample> = input["wheelLog"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|sample| WheelSample {
                        t: f64_of(&sample["t"]),
                        delta_y: f64_of(&sample["deltaY"]),
                        delta_mode: sample["deltaMode"].as_u64().unwrap_or(0) as u32,
                    })
                    .collect();
                json!(classify_gesture(&log))
            }
            "decayRate" => num(decay_rate(n("velocity"), n("distance"))),
            other => panic!("unknown fn {other}"),
        }
    });
}
