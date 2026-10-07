//! Port of `src/hooks/cal-events/all-day-lanes.test.ts`, `src/lib/event-drag.test.ts`,
//! `src/lib/drag-to-create.test.ts` and `month-view/weekSnapFling.test.ts`.
//! Cases the golden fixtures already pin exactly are left out, as are the
//! frame-scheduling tests of `startSnapFling` (cancel, shift, frame APIs),
//! which belong to the app's scroll session.

use chrono::{NaiveDate, Timelike};
use rencal_layout::drag::{
    CreateSelection, DragGrab, DropHit, DropZone, clamp_point_to_rect, compute_drop_range,
    day_selection_for_pointer, day_selection_range, edge_scroll_delta, grab_for, make_drag_preview,
    minutes_at_y, selection_for_pointer, selection_range,
};
use rencal_layout::week_snap::{
    SnapFling, WheelSample, classify_gesture, decay_rate, pick_fling_target, pick_snap_target,
    predict_fling_end,
};
use rencal_layout::{
    AllDayLaneItem, AllDaySpan, Point, Rect, assign_all_day_lanes, build_all_day_span,
};
use rencal_time::{
    CalendarEvent, EventTime, EventTimeRange, Tz, at_time, date_from_epoch_day, parse_tz,
};
use serde_json::json;

fn stockholm() -> Tz {
    parse_tz("Europe/Stockholm").unwrap()
}

fn day(s: &str) -> NaiveDate {
    s.parse().unwrap()
}

fn event(id: &str, start: EventTime, end: EventTime, viewer: Tz) -> CalendarEvent {
    serde_json::from_value::<CalendarEvent>(json!({
        "id": id,
        "summary": "Book pub quiz",
        "calendar_slug": "calendar",
        "start": start,
        "end": end,
    }))
    .unwrap()
    .with_viewer(viewer)
}

/// An all-day event occupying epoch days `first..=last`.
fn all_day_event(id: &str, first: i32, last: i32) -> CalendarEvent {
    let date = |d: i32| EventTime::Date(date_from_epoch_day(d));
    event(id, date(first), date(last + 1), stockholm())
}

fn at(date: &str, hour: u32, minute: u32) -> EventTime {
    at_time(day(date), hour, minute, stockholm())
}

/// `YYYY-MM-DD HH:MM` in the viewer's zone.
fn wallclock(time: &EventTime) -> String {
    let z = time.to_viewer_zoned(stockholm());
    format!("{} {:02}:{:02}", z.date_naive(), z.hour(), z.minute())
}

fn span(start_col: usize, end_col: usize, is_start: bool, is_end: bool) -> AllDaySpan {
    AllDaySpan {
        start_col,
        end_col,
        is_start,
        is_end,
    }
}

// all-day-lanes.test.ts

#[test]
fn build_all_day_span_clamps_to_both_edges() {
    let item = build_all_day_span(7, &all_day_event("clipped", 8, 15), 10, 13).unwrap();
    assert_eq!(item.event, 7);
    assert_eq!(item.lane, 0);
    assert_eq!(item.span, span(0, 4, false, false));
}

#[test]
fn build_all_day_span_records_unclipped_ends() {
    let item = build_all_day_span(0, &all_day_event("inside", 11, 12), 10, 13).unwrap();
    assert_eq!(item.span, span(1, 3, true, true));
}

#[test]
fn build_all_day_span_misses_outside_events() {
    assert!(build_all_day_span(0, &all_day_event("before", 7, 9), 10, 13).is_none());
    assert!(build_all_day_span(0, &all_day_event("after", 14, 16), 10, 13).is_none());
}

#[test]
fn lanes_pack_disjoint_spans_and_separate_overlaps() {
    let events = [
        all_day_event("later", 11, 13),
        all_day_event("earlier", 10, 12),
        all_day_event("tail", 13, 13),
    ];
    let mut items: Vec<_> = events
        .iter()
        .enumerate()
        .map(|(i, e)| build_all_day_span(i, e, 10, 13).unwrap())
        .collect();

    assert_eq!(assign_all_day_lanes(&mut items, 4), 2);
    let placed: Vec<_> = items
        .iter()
        .map(|item| (events[item.event].id.as_str(), item.lane))
        .collect();
    assert_eq!(placed, [("earlier", 0), ("later", 1), ("tail", 0)]);
}

#[test]
fn create_selection_gets_the_priority_of_an_appended_draft() {
    let item = |event, start_col, end_col| AllDayLaneItem {
        event,
        span: span(start_col, end_col, true, true),
        lane: 0,
    };
    let mut items = [
        item("existing-long", 0, 5),
        item("existing-short", 1, 3),
        item("selection", 0, 7),
    ];

    assign_all_day_lanes(&mut items, 7);

    let placed: Vec<_> = items.iter().map(|item| (item.event, item.lane)).collect();
    assert_eq!(
        placed,
        [
            ("selection", 0),
            ("existing-long", 1),
            ("existing-short", 2)
        ]
    );
}

// event-drag.test.ts (viewer: Europe/Stockholm)

const NO_GRAB: DragGrab = DragGrab {
    day_offset: 0,
    minute_offset: 0.0,
};

fn hit(zone: DropZone, date: &str, minutes: Option<f64>) -> DropHit {
    DropHit {
        zone,
        day: day(date),
        minutes,
    }
}

fn timed_event(start: EventTime, end: EventTime) -> CalendarEvent {
    event("event", start, end, stockholm())
}

#[test]
fn drop_on_month_cell_keeps_wallclock_and_duration() {
    let e = timed_event(at("2025-07-12", 17, 0), at("2025-07-12", 19, 30));
    let range = compute_drop_range(&e, &hit(DropZone::Day, "2025-07-14", None), &NO_GRAB).unwrap();
    assert_eq!(wallclock(&range.start), "2025-07-14 17:00");
    assert_eq!(wallclock(&range.end), "2025-07-14 19:30");
    assert!(matches!(range.start, EventTime::Zoned(_)));
}

#[test]
fn drop_on_own_day_is_a_no_op() {
    let e = timed_event(at("2025-07-12", 17, 0), at("2025-07-12", 18, 0));
    assert!(compute_drop_range(&e, &hit(DropZone::Day, "2025-07-12", None), &NO_GRAB).is_none());
}

#[test]
fn all_day_event_moves_by_whole_days() {
    let e = timed_event(
        EventTime::Date(day("2025-07-12")),
        EventTime::Date(day("2025-07-13")),
    );
    let range = compute_drop_range(&e, &hit(DropZone::Day, "2025-07-20", None), &NO_GRAB);
    assert_eq!(
        range,
        Some(EventTimeRange::new(
            EventTime::Date(day("2025-07-20")),
            EventTime::Date(day("2025-07-21")),
        ))
    );
}

#[test]
fn multi_day_event_keeps_the_grabbed_day_under_the_pointer() {
    // Runs Mon 7 → Wed 9 (exclusive end Thu 10), grabbed on Wed.
    let e = timed_event(
        EventTime::Date(day("2025-07-07")),
        EventTime::Date(day("2025-07-10")),
    );
    let grab = grab_for(&e, Some(&hit(DropZone::Day, "2025-07-09", None)));
    assert_eq!(grab.day_offset, 2);

    let range = compute_drop_range(&e, &hit(DropZone::Day, "2025-07-16", None), &grab);
    assert_eq!(
        range,
        Some(EventTimeRange::new(
            EventTime::Date(day("2025-07-14")),
            EventTime::Date(day("2025-07-17")),
        ))
    );
}

#[test]
fn timed_drop_snaps_to_15_minutes_and_honours_the_grab_offset() {
    let e = timed_event(at("2025-07-12", 19, 0), at("2025-07-12", 20, 0));
    // Grabbed 7 minutes into the block.
    let grab = grab_for(
        &e,
        Some(&hit(DropZone::Timed, "2025-07-12", Some(19.0 * 60.0 + 7.0))),
    );
    assert_eq!(grab.minute_offset, 7.0);

    // Pointer at 18:12 on the next day → block top at 18:05 → snaps to 18:00.
    let range = compute_drop_range(
        &e,
        &hit(DropZone::Timed, "2025-07-13", Some(18.0 * 60.0 + 12.0)),
        &grab,
    )
    .unwrap();
    assert_eq!(wallclock(&range.start), "2025-07-13 18:00");
    assert_eq!(wallclock(&range.end), "2025-07-13 19:00");
}

#[test]
fn timed_drop_stays_inside_the_day() {
    let e = timed_event(at("2025-07-12", 9, 0), at("2025-07-12", 11, 0));

    let late = compute_drop_range(
        &e,
        &hit(DropZone::Timed, "2025-07-12", Some(23.0 * 60.0 + 30.0)),
        &NO_GRAB,
    )
    .unwrap();
    assert_eq!(wallclock(&late.start), "2025-07-12 22:00");
    assert_eq!(wallclock(&late.end), "2025-07-13 00:00");

    let early = compute_drop_range(
        &e,
        &hit(DropZone::Timed, "2025-07-12", Some(-40.0)),
        &NO_GRAB,
    )
    .unwrap();
    assert_eq!(wallclock(&early.start), "2025-07-12 00:00");
}

#[test]
fn event_ending_at_midnight_lasts_until_midnight_when_clamping() {
    let e = timed_event(at("2025-07-12", 22, 0), at("2025-07-13", 0, 0));
    let range = compute_drop_range(
        &e,
        &hit(DropZone::Timed, "2025-07-12", Some(18.0 * 60.0)),
        &NO_GRAB,
    )
    .unwrap();
    assert_eq!(wallclock(&range.start), "2025-07-12 18:00");
    assert_eq!(wallclock(&range.end), "2025-07-12 20:00");
}

#[test]
fn drops_never_change_an_events_kind() {
    let timed = timed_event(at("2025-07-12", 9, 0), at("2025-07-12", 10, 0));
    let all_day = timed_event(
        EventTime::Date(day("2025-07-12")),
        EventTime::Date(day("2025-07-13")),
    );
    assert!(
        compute_drop_range(&timed, &hit(DropZone::AllDay, "2025-07-14", None), &NO_GRAB).is_none()
    );
    assert!(
        compute_drop_range(
            &all_day,
            &hit(DropZone::Timed, "2025-07-14", Some(600.0)),
            &NO_GRAB
        )
        .is_none()
    );
}

#[test]
fn multi_day_timed_event_moves_across_the_all_day_lane_by_whole_days() {
    let e = timed_event(at("2025-07-12", 20, 0), at("2025-07-13", 10, 0));
    let range =
        compute_drop_range(&e, &hit(DropZone::AllDay, "2025-07-15", None), &NO_GRAB).unwrap();
    assert_eq!(wallclock(&range.start), "2025-07-15 20:00");
    assert_eq!(wallclock(&range.end), "2025-07-16 10:00");
}

#[test]
fn drag_preview_recomputes_date_info_with_its_own_id() {
    let e = timed_event(at("2025-07-12", 9, 0), at("2025-07-12", 10, 0));
    let preview = make_drag_preview(
        &e,
        &EventTimeRange::new(at("2025-07-14", 9, 0), at("2025-07-14", 10, 0)),
        stockholm(),
    );
    assert_ne!(preview.id, e.id);
    assert_eq!(preview.date_info.first_day, e.date_info.first_day + 2);
}

const SCROLL_RECT: Rect = Rect {
    left: 100.0,
    top: 100.0,
    right: 500.0,
    bottom: 400.0,
};

fn edge(x: f32, y: f32, scroll_x: bool) -> Point {
    edge_scroll_delta(&SCROLL_RECT, Point { x, y }, scroll_x, true)
}

#[test]
fn edge_scroll_is_zero_away_from_the_edges() {
    assert_eq!(edge(300.0, 250.0, true), Point::default());
}

#[test]
fn edge_scroll_speeds_up_toward_the_edge() {
    let near = edge(470.0, 250.0, true);
    let nearer = edge(495.0, 250.0, true);
    assert!(near.x > 0.0);
    assert!(nearer.x > near.x);
    assert_eq!(near.y, 0.0);
    assert!(edge(300.0, 105.0, true).y < 0.0);
}

#[test]
fn edge_scroll_ignores_axes_that_cannot_scroll() {
    assert_eq!(edge(495.0, 105.0, false).x, 0.0);
}

#[test]
fn edge_scroll_stops_far_outside_the_container() {
    assert_eq!(edge(800.0, 250.0, true), Point::default());
}

// drag-to-create.test.ts

fn selection(start_minutes: i32, end_minutes: i32) -> CreateSelection {
    CreateSelection {
        start_minutes,
        end_minutes,
    }
}

#[test]
fn selection_covers_the_anchor_slot_and_grows_toward_the_pointer() {
    let m = |h: i32, min: i32| f64::from(h * 60 + min);
    // Within the anchor's slot.
    assert_eq!(selection_for_pointer(m(9, 7), m(9, 8)), selection(540, 555));
    // Dragging down rounds the end up.
    assert_eq!(
        selection_for_pointer(m(9, 7), m(10, 2)),
        selection(540, 615)
    );
    // Dragging up rounds the start down.
    assert_eq!(
        selection_for_pointer(m(9, 7), m(8, 52)),
        selection(525, 555)
    );
    // Pointers outside the day clamp.
    assert_eq!(selection_for_pointer(60.0, -100.0), selection(0, 75));
    assert_eq!(
        selection_for_pointer(m(23, 50), 1600.0),
        selection(1425, 1440)
    );
    // An anchor on the bottom edge stays in the final slot.
    assert_eq!(selection_for_pointer(1440.0, 1440.0), selection(1425, 1440));
}

#[test]
fn selection_ending_at_24_00_ends_at_next_midnight() {
    let range = selection_range(day("2025-03-30"), &selection(1425, 1440), stockholm());
    assert_eq!(wallclock(&range.start), "2025-03-30 23:45");
    assert_eq!(wallclock(&range.end), "2025-03-31 00:00");
}

#[test]
fn minutes_at_y_maps_top_middle_and_bottom() {
    assert_eq!(minutes_at_y(100.0, 1440.0, 100.0), 0.0);
    assert_eq!(minutes_at_y(100.0, 1440.0, 820.0), 720.0);
    assert_eq!(minutes_at_y(100.0, 1440.0, 1540.0), 1440.0);
}

#[test]
fn day_selection_grows_either_way_from_the_anchor() {
    let anchor = day("2026-09-09");
    let after = day_selection_for_pointer(anchor, day("2026-09-12"));
    assert_eq!((after.start, after.end), (anchor, day("2026-09-12")));
    let before = day_selection_for_pointer(anchor, day("2026-09-06"));
    assert_eq!((before.start, before.end), (day("2026-09-06"), anchor));
    let same = day_selection_for_pointer(anchor, anchor);
    assert_eq!((same.start, same.end), (anchor, anchor));
}

#[test]
fn day_selection_range_is_all_day_with_an_exclusive_end() {
    let range = day_selection_range(&day_selection_for_pointer(
        day("2026-09-09"),
        day("2026-09-12"),
    ));
    assert_eq!(range.start, EventTime::Date(day("2026-09-09")));
    assert_eq!(range.end, EventTime::Date(day("2026-09-13")));
}

#[test]
fn clamp_point_insets_each_edge_by_one_pixel() {
    let rect = Rect {
        left: 10.0,
        top: 20.0,
        right: 110.0,
        bottom: 220.0,
    };
    let clamp = |x, y| clamp_point_to_rect(&rect, Point { x, y });
    assert_eq!(clamp(0.0, 50.0), Point { x: 11.0, y: 50.0 });
    assert_eq!(clamp(200.0, 50.0), Point { x: 109.0, y: 50.0 });
    assert_eq!(clamp(50.0, 0.0), Point { x: 50.0, y: 21.0 });
    assert_eq!(clamp(50.0, 300.0), Point { x: 50.0, y: 219.0 });
}

// weekSnapFling.test.ts

#[test]
fn predicts_and_clamps_the_native_fling_end() {
    for (from, velocity, max, end) in [
        (100.0, 400.0, 1000.0, 200.0),
        (100.0, -800.0, 1000.0, 0.0),
        (900.0, 800.0, 1000.0, 1000.0),
        (100.0, 0.0, 1000.0, 100.0),
        (100.0, 100.0, -10.0, 0.0),
    ] {
        assert_eq!(
            predict_fling_end(from, velocity, max),
            end,
            "from {from} at {velocity}"
        );
    }
}

#[test]
fn picks_a_clamped_week_boundary() {
    for (offset, height, max, target) in [
        (140.0, 100.0, 1000.0, 100.0),
        (150.0, 100.0, 1000.0, 200.0),
        (160.0, 100.0, 1000.0, 200.0),
        (-60.0, 100.0, 1000.0, 0.0),
        (990.0, 100.0, 975.0, 975.0),
        (100.0, 100.0, -20.0, 0.0),
        (187.0, 125.5, 1000.0, 125.5),
    ] {
        assert_eq!(
            pick_snap_target(offset, height, max),
            target,
            "offset {offset}"
        );
    }
}

#[test]
fn decay_rate_matches_velocity_within_bounds() {
    assert_eq!(decay_rate(600.0, 100.0), 6.0);
    assert_eq!(decay_rate(-600.0, -100.0), 6.0);
    assert_eq!(decay_rate(0.0, 100.0), 4.0);
    assert_eq!(decay_rate(1.0, 100.0), 4.0);
    assert_eq!(decay_rate(600.0, 1.0), 30.0);
    assert_eq!(decay_rate(0.0, 0.0), 4.0);
}

#[test]
fn fling_targets_are_only_ahead_of_the_start() {
    for (from, velocity, height, max, target) in [
        (118.0, 62.5, 100.0, 1000.0, Some(200.0)), // Predicted end just past a crossed line.
        (99.5, 1.0, 100.0, 1000.0, Some(200.0)),   // A subpixel gap counts as reached.
        (178.0, 1125.0, 100.0, 1000.0, Some(500.0)),
        (282.0, -62.5, 100.0, 1000.0, Some(200.0)),
        (200.5, -1.0, 100.0, 1000.0, Some(100.0)),
        (822.0, -1125.0, 100.0, 1000.0, Some(500.0)),
        (130.0, 40.0, 125.5, 1000.0, Some(251.0)),
        (245.0, -40.0, 125.5, 1000.0, Some(125.5)),
        (960.0, 100.0, 100.0, 975.0, Some(975.0)),
        (975.0, 100.0, 100.0, 975.0, None),
        (974.5, 100.0, 100.0, 975.0, None),
        (0.0, -100.0, 100.0, 975.0, None),
        (100.0, 0.0, 100.0, 1000.0, None),
    ] {
        assert_eq!(
            pick_fling_target(from, velocity, height, max),
            target,
            "from {from} at {velocity}"
        );
    }
}

fn wheel_log(deltas: &[f64], delta_mode: u32) -> Vec<WheelSample> {
    deltas
        .iter()
        .enumerate()
        .map(|(i, &delta_y)| WheelSample {
            t: i as f64 * 16.0,
            delta_y,
            delta_mode,
        })
        .collect()
}

#[test]
fn classifies_wheel_signatures() {
    let cases: [(&[f64], bool); 8] = [
        (&[], false),
        (&[120.0], false),
        (&[12.0, 18.0], false),
        (&[12.0, 18.0, 12.0], true),
        (&[-12.0, -18.0, -12.0], true),
        (&[0.25, 0.5, 0.25], true),
        (&[120.0, 120.0, 120.0, 120.0], false),
        (&[12.0, -12.0, 12.0], false),
    ];
    for (deltas, precise) in cases {
        assert_eq!(
            classify_gesture(&wheel_log(deltas, 0)),
            precise,
            "{deltas:?}"
        );
    }
}

#[test]
fn classifies_only_the_capture_window_including_its_boundary() {
    let mut log = wheel_log(&[12.0, 18.0, 12.0], 0);
    for (sample, t) in log.iter_mut().zip([0.0, 75.0, 150.0]) {
        sample.t = t;
    }
    assert!(classify_gesture(&log));
    log[2].t = 151.0;
    assert!(!classify_gesture(&log));
}

#[test]
fn excludes_explicit_wheel_delta_modes() {
    for mode in [1, 2] {
        assert!(!classify_gesture(&wheel_log(&[12.0, 18.0, 12.0], mode)));
    }
}

/// Offsets a session would write sampling `fling` every `step_ms` until done.
fn sample(fling: &SnapFling, step_ms: f64, max_steps: usize) -> Vec<f64> {
    let mut offsets = Vec::new();
    let mut elapsed = 0.0;
    for _ in 0..max_steps {
        elapsed += step_ms;
        offsets.push(fling.offset_at(elapsed));
        if fling.is_done(elapsed) {
            break;
        }
    }
    offsets
}

#[test]
fn lands_exactly_and_monotonically() {
    for (from, velocity, to) in [(140.0, 0.0, 200.0), (240.0, -600.0, 100.0)] {
        let fling = SnapFling::new(from, velocity, to);
        let offsets = sample(&fling, 8.0, 200);
        assert_eq!(offsets.last(), Some(&to));
        let direction = f64::signum(to - from);
        let mut previous = from;
        for &offset in &offsets {
            assert!((offset - previous) * direction >= 0.0);
            assert!(offset >= from.min(to) && offset <= from.max(to));
            previous = offset;
        }
    }
}

#[test]
fn keeps_fractional_positions() {
    let fling = SnapFling::new(140.25, 0.0, 200.5);
    let mid = fling.offset_at(100.0);
    assert_ne!(mid, mid.round());
    assert_eq!(fling.offset_at(400.0), 200.5);
}

#[test]
fn reaches_the_target_at_the_finite_landing_time() {
    let fling = SnapFling::new(0.0, 600.0, 150.0);
    let duration = (600.0f64 / 60.0).ln() / 4.0 * 1000.0;
    let before = duration - 1.0;
    assert!(fling.offset_at(before) < 150.0);
    assert!(!fling.is_done(before));
    assert_eq!(fling.offset_at(before + 1.0), 150.0);
    assert!(fling.is_done(before + 1.0));
}

#[test]
fn moves_at_least_one_pixel_per_full_60hz_frame() {
    for to in [150.0, -150.0] {
        let fling = SnapFling::new(0.0, 0.0, to);
        let mut previous = 0.0;
        let mut elapsed = 0.0;
        loop {
            elapsed += 1000.0 / 60.0;
            let offset = fling.offset_at(elapsed);
            // The last frame may span only what remains before the landing time.
            if fling.is_done(elapsed) {
                break;
            }
            assert!(f64::abs(offset - previous) >= 1.0, "to {to} at {elapsed}");
            previous = offset;
        }
    }
}

#[test]
fn lands_short_corrections_without_dividing_by_zero() {
    for to in [0.0, 1.0, -1.0, 15.0] {
        let fling = SnapFling::new(0.0, 0.0, to);
        assert!(fling.is_done(16.0));
        assert_eq!(fling.offset_at(16.0), to);
    }
}

#[test]
fn caps_a_long_tail_at_1500ms() {
    let fling = SnapFling::new(0.0, 0.0, 10000.0);
    assert!(fling.offset_at(1499.0) < 10000.0);
    assert!(!fling.is_done(1499.0));
    assert_eq!(fling.offset_at(1500.0), 10000.0);
    assert!(fling.is_done(1500.0));
}
