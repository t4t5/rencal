//! Headless tests of the calendar views against `docs/scroll-behaviour.md`.

use std::time::Duration;

use chrono::NaiveDate;
use gpui_kit::{
    Entity, Modifiers, ScrollDelta, ScrollWheelEvent, TestAppContext, TouchPhase,
    VisualTestContext, point, px,
};
use rencal_config::ThemeConfig;
use rencal_time::{FirstDayOfWeek, epoch_day, start_of_week};

use super::axis::SETTLE_IDLE;
use super::month::{MonthView, week_index};
use super::week::WeekView;
use crate::navigation::{Navigation, ScrollBehavior};
use crate::{actions, test_support};

fn date(s: &str) -> NaiveDate {
    s.parse().unwrap()
}

fn init(cx: &mut TestAppContext) {
    cx.update(|cx| {
        test_support::init(ThemeConfig::default(), None, cx);
        actions::init(cx);
    });
}

fn month_view(cx: &mut TestAppContext) -> (Entity<MonthView>, &mut VisualTestContext) {
    init(cx);
    let (view, cx) = cx.add_window_view(MonthView::new);
    cx.run_until_parked();
    (view, cx)
}

fn jump(cx: &mut VisualTestContext, to: NaiveDate) {
    cx.update(|_, cx| Navigation::navigate_to(to, Some(ScrollBehavior::Instant), cx));
    cx.run_until_parked();
}

fn week(date: NaiveDate) -> f64 {
    week_index(date, FirstDayOfWeek::Monday) as f64
}

#[gpui_kit::test]
fn month_opens_on_the_week_of_the_1st(cx: &mut TestAppContext) {
    let (view, cx) = month_view(cx);
    view.read_with(cx, |view, _| {
        assert_eq!(view.position(), week(date("2026-10-01")));
        assert!(view.axis().is_measured());
    });
}

#[gpui_kit::test]
fn month_jumps_scroll_only_when_the_week_is_out_of_view(cx: &mut TestAppContext) {
    let (view, cx) = month_view(cx);
    let start = week(date("2026-10-01"));

    // Visible already: the viewport stays.
    jump(cx, date("2026-10-08"));
    view.read_with(cx, |view, _| assert_eq!(view.position(), start));

    // Far away: its week goes to the top.
    jump(cx, date("2027-03-17"));
    view.read_with(cx, |view, _| {
        assert_eq!(view.position(), week(date("2027-03-17")))
    });

    // The same date again after scrolling away ("t" brings today back).
    jump(cx, date("2026-10-07"));
    view.read_with(cx, |view, _| {
        assert_eq!(view.position(), week(date("2026-10-07")))
    });
    view.update(cx, |view, _| view.scroll_for_test(-2000.0));
    jump(cx, date("2026-10-07"));
    view.read_with(cx, |view, _| {
        assert_eq!(view.position(), week(date("2026-10-07")))
    });
    // Scrolling never moved the active date.
    cx.update(|_, cx| assert_eq!(Navigation::active_date(cx), date("2026-10-07")));
}

#[gpui_kit::test]
fn month_scrolls_settle_on_a_week_row(cx: &mut TestAppContext) {
    let (view, cx) = month_view(cx);
    let start = view.read_with(cx, |view, _| view.position());
    cx.simulate_event(ScrollWheelEvent {
        position: point(px(600.), px(500.)),
        delta: ScrollDelta::Lines(point(0., -2.)),
        modifiers: Modifiers::default(),
        touch_phase: TouchPhase::Moved,
    });
    let scrolled = view.read_with(cx, |view, _| view.position());
    assert!(
        scrolled > start && scrolled.fract() != 0.0,
        "{start} → {scrolled}"
    );

    cx.executor()
        .advance_clock(SETTLE_IDLE + Duration::from_millis(10));
    cx.run_until_parked();
    view.read_with(cx, |view, _| {
        let target = view.axis().snap_target().expect("settling");
        assert_eq!(target, target.round());
        assert_eq!(target, scrolled.round());
    });
}

#[gpui_kit::test]
fn week_opens_on_the_active_week_and_jumps_by_week(cx: &mut TestAppContext) {
    init(cx);
    let (view, cx) = cx.add_window_view(WeekView::new);
    cx.run_until_parked();
    let monday = |d: &str| f64::from(epoch_day(start_of_week(date(d), FirstDayOfWeek::Monday)));
    view.read_with(cx, |view, _| {
        assert_eq!(view.position(), monday("2026-10-07"))
    });

    jump(cx, date("2026-10-09"));
    view.read_with(cx, |view, _| {
        assert_eq!(view.position(), monday("2026-10-07"))
    });

    jump(cx, date("2026-11-20"));
    view.read_with(cx, |view, _| {
        assert_eq!(view.position(), monday("2026-11-20"))
    });
}
