//! Headless tests of the editing flows (GPUI_PORT_PLAN.md §9): the popover,
//! its inputs, drafts, drags and commands.

use chrono::NaiveDate;
use gpui_kit::{AnyWindowHandle, Entity, Modifiers, TestAppContext, VisualTestContext, point};
use rencal_config::ThemeConfig;
use rencal_time::Calendar;
use rencal_time::event::DateRange;

use gpui_kit::{Bounds, MouseButton, Pixels, Point, px};
use rencal_layout::drag::DropZone;
use rencal_time::{CalendarEvent, EventKey, EventTime};

use super::commands;
use super::context_menu;
use super::dialogs::Scope;
use super::draft::{DayDraft, DraftState};
use super::form::EventForm;
use super::popover::EventPopover;
use crate::event_store::EventStore;
use crate::event_store::test_events::timed;
use crate::keymap::ComposeEvent;
use crate::ui::anchors::Anchors;
use crate::ui_state::UiState;
use crate::windows::main_window;
use crate::{actions, test_support};

fn date(s: &str) -> NaiveDate {
    s.parse().unwrap()
}

fn work_calendar() -> Calendar {
    Calendar {
        slug: "work".into(),
        name: Some("Work".into()),
        color: Some("#4c8bf5".into()),
        provider: None,
        account: None,
        read_only: None,
    }
}

/// The main window with a writable calendar and a couple of events.
fn open(cx: &mut TestAppContext) -> &mut VisualTestContext {
    open_view(cx, "month")
}

fn open_view<'a>(cx: &'a mut TestAppContext, view: &str) -> &'a mut VisualTestContext {
    let view = view.to_owned();
    let handle: AnyWindowHandle = cx.update(|cx| {
        test_support::init(ThemeConfig::default(), None, cx);
        actions::init(cx);
        UiState::update(cx, |ui| ui.calendar_view = view);
        EventStore::global(cx).update(cx, |store, cx| {
            store.set_calendars(vec![work_calendar()], cx);
            let utc = chrono_tz::UTC;
            store.set_test_events(
                vec![
                    timed(
                        "standup",
                        "Standup",
                        "2026-10-07 09:00",
                        "2026-10-07 09:30",
                        utc,
                    ),
                    timed(
                        "review",
                        "Review",
                        "2026-10-07 14:00",
                        "2026-10-07 15:00",
                        utc,
                    ),
                ],
                DateRange {
                    start: date("2026-08-01"),
                    end: date("2026-12-01"),
                },
                cx,
            );
        });
        main_window::open(cx).unwrap();
        main_window::handle(cx).unwrap()
    });
    let cx = VisualTestContext::from_window(handle, cx).into_mut();
    // Focus events only fire in the active window.
    cx.update(|window, _| window.activate_window());
    cx.run_until_parked();
    cx
}

fn form(cx: &mut VisualTestContext) -> Option<Entity<EventForm>> {
    cx.update(|_, cx| EventPopover::global(cx)?.read(cx).form().cloned())
}

fn open_draft(cx: &mut VisualTestContext) {
    cx.update(|_, cx| {
        DraftState::open_day_draft(date("2026-10-08"), None, DayDraft::default(), cx)
    });
    cx.run_until_parked();
}

fn click_start_time(cx: &mut VisualTestContext) {
    let form = form(cx).expect("a form");
    let bounds = cx.update(|_, cx| {
        let field = form.read(cx).start_time().clone();
        let combo = field.read(cx).combo().clone();
        combo.read(cx).bounds()
    });
    let center = point(bounds.right() - bounds.size.width / 3.0, bounds.center().y);
    cx.simulate_click(center, Modifiers::default());
    cx.run_until_parked();
}

fn start_time_open(cx: &mut VisualTestContext) -> bool {
    let form = form(cx).expect("a form");
    cx.update(|_, cx| {
        let field = form.read(cx).start_time().clone();
        let combo = field.read(cx).combo().clone();
        combo.read(cx).is_open()
    })
}

#[gpui_kit::test]
fn the_time_field_opens_in_every_popover(cx: &mut TestAppContext) {
    let cx = open(cx);
    open_draft(cx);
    click_start_time(cx);
    assert!(start_time_open(cx), "first popover");
    // The list opens on the current time (the draft starts at 10:00).
    let first = form(cx).unwrap();
    let (highlighted, offset) = cx.update(|_, cx| {
        let field = first.read(cx).start_time().clone();
        let combo = field.read(cx).combo().clone();
        let combo = combo.read(cx);
        (combo.highlighted().cloned(), combo.scroll_offset())
    });
    assert_eq!(highlighted.as_deref(), Some("10:00"));
    assert!(
        offset.y < gpui_kit::px(0.),
        "scrolled to the highlight: {offset:?}"
    );

    cx.update(|_, cx| DraftState::global(cx).update(cx, |state, cx| state.close_popover(cx)));
    cx.run_until_parked();
    assert!(form(cx).is_none());

    open_draft(cx);
    click_start_time(cx);
    assert!(start_time_open(cx), "second popover");
}

fn key(id: &str) -> EventKey {
    EventKey(format!("work::{id}"))
}

fn event(cx: &mut VisualTestContext, id: &str) -> Option<CalendarEvent> {
    cx.update(|_, cx| EventStore::global(cx).read(cx).event(&key(id)).cloned())
}

fn block(cx: &mut VisualTestContext, id: &str) -> Bounds<Pixels> {
    cx.update(|_, cx| Anchors::event_bounds(&key(id), None, cx))
        .unwrap_or_else(|| panic!("{id} is drawn"))
}

/// A left-button drag in small steps, like a pointer.
fn drag(cx: &mut VisualTestContext, from: Point<Pixels>, to: Point<Pixels>) {
    cx.simulate_mouse_down(from, MouseButton::Left, Modifiers::default());
    cx.run_until_parked();
    for step in 1..=10 {
        let t = step as f32 / 10.0;
        let at = point(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
        cx.simulate_mouse_move(at, MouseButton::Left, Modifiers::default());
        cx.run_until_parked();
    }
    cx.simulate_mouse_up(to, MouseButton::Left, Modifiers::default());
    cx.run_until_parked();
}

/// Window y of `minutes` into `day`'s week column.
fn column_y(cx: &mut VisualTestContext, day: &str, minutes: f32) -> (Pixels, Pixels) {
    let column = cx
        .update(|_, cx| Anchors::drop_for(DropZone::Timed, date(day), cx))
        .expect("the column is drawn");
    let y = column.full.top() + column.full.size.height * (minutes / (24.0 * 60.0));
    (column.bounds.center().x, y)
}

fn wallclock(time: &EventTime) -> String {
    match time {
        EventTime::Zoned(dt) => dt.format("%Y-%m-%d %H:%M").to_string(),
        EventTime::Date(date) => date.to_string(),
        other => format!("{other:?}"),
    }
}

#[gpui_kit::test]
fn clicking_an_event_opens_it_and_closing_saves_the_edit(cx: &mut TestAppContext) {
    let cx = open_view(cx, "week");
    let review = block(cx, "review");
    cx.simulate_click(review.center(), Modifiers::default());
    cx.run_until_parked();
    let form = form(cx).expect("the popover is open");
    assert_eq!(
        form.read_with(cx, |form, _| form.event().summary.clone()),
        "Review"
    );

    cx.update(|window, cx| form.update(cx, |form, cx| form.focus_entry(window, cx)));
    cx.simulate_keystrokes("end");
    cx.simulate_input(" 2");
    // Escape in the title closes the popover, which saves.
    cx.simulate_keystrokes("escape");
    cx.run_until_parked();
    assert!(self::form(cx).is_none());
    assert_eq!(event(cx, "review").unwrap().summary, "Review 2");
}

#[gpui_kit::test]
fn an_open_event_locks_the_calendar_shortcuts_and_tab_enters_it(cx: &mut TestAppContext) {
    let cx = open(cx);
    cx.update(|_, cx| super::popover::open_event(key("review"), None, cx));
    cx.run_until_parked();
    assert!(form(cx).is_some());

    // `w` would switch to the week view; with an event open it does nothing.
    cx.simulate_keystrokes("w");
    assert_eq!(
        cx.update(|_, cx| UiState::global(cx).calendar_view.clone()),
        "month"
    );

    cx.simulate_keystrokes("tab");
    let form = form(cx).unwrap();
    assert!(cx.update(|window, cx| form.read(cx).title_focused(window, cx)));

    cx.simulate_keystrokes("escape");
    cx.run_until_parked();
    assert!(self::form(cx).is_none());
    cx.simulate_keystrokes("w");
    assert_eq!(
        cx.update(|_, cx| UiState::global(cx).calendar_view.clone()),
        "week"
    );
}

#[gpui_kit::test]
fn dragging_a_week_block_moves_it_by_days_and_snapped_minutes(cx: &mut TestAppContext) {
    let cx = open_view(cx, "week");
    let review = block(cx, "review");
    let from = review.center();
    // One column right and an hour (48px) down.
    let (thursday_x, _) = column_y(cx, "2026-10-08", 0.0);
    let to = point(thursday_x, from.y + px(48.));
    drag(cx, from, to);

    let moved = event(cx, "review").unwrap();
    assert_eq!(wallclock(&moved.start), "2026-10-08 15:00");
    assert_eq!(wallclock(&moved.end), "2026-10-08 16:00");
    // The release didn't navigate to the day under the pointer.
    assert_eq!(
        cx.update(|_, cx| crate::navigation::Navigation::active_date(cx)),
        date("2026-10-07")
    );
}

#[gpui_kit::test]
fn dragging_empty_column_space_opens_a_draft_for_the_selection(cx: &mut TestAppContext) {
    let cx = open_view(cx, "week");
    let (x, from_y) = column_y(cx, "2026-10-08", 16.0 * 60.0 + 5.0);
    let (_, to_y) = column_y(cx, "2026-10-08", 17.0 * 60.0 + 20.0);
    drag(cx, point(x, from_y), point(x, to_y));

    let draft = cx.update(|_, cx| {
        let state = DraftState::read(cx);
        assert!(state.is_popover_open());
        state.draft().clone()
    });
    assert_eq!(wallclock(&draft.start), "2026-10-08 16:00");
    assert_eq!(wallclock(&draft.end), "2026-10-08 17:30");
}

#[gpui_kit::test]
fn dragging_across_month_cells_drafts_an_all_day_range(cx: &mut TestAppContext) {
    let cx = open(cx);
    let cell = |cx: &mut VisualTestContext, day: &str| {
        cx.update(|_, cx| Anchors::drop_for(DropZone::Day, date(day), cx))
            .expect("the cell is drawn")
            .bounds
    };
    let from = cell(cx, "2026-10-20");
    let to = cell(cx, "2026-10-22");
    // Low in the cells, clear of any event.
    let below = |b: Bounds<Pixels>| point(b.center().x, b.bottom() - px(6.));
    drag(cx, below(from), below(to));

    let draft = cx.update(|_, cx| DraftState::read(cx).draft().clone());
    assert_eq!(wallclock(&draft.start), "2026-10-20");
    assert_eq!(wallclock(&draft.end), "2026-10-23");
}

#[gpui_kit::test]
fn composing_creates_the_parsed_event(cx: &mut TestAppContext) {
    let cx = open(cx);
    cx.dispatch_action(ComposeEvent);
    cx.run_until_parked();
    cx.simulate_input("Lunch tomorrow at 1pm");
    cx.executor()
        .advance_clock(std::time::Duration::from_millis(350));
    cx.run_until_parked();
    cx.simulate_keystrokes("enter");
    cx.run_until_parked();

    let created = cx.update(|_, cx| {
        EventStore::global(cx)
            .read(cx)
            .events()
            .iter()
            .find(|e| e.summary == "Lunch")
            .cloned()
    });
    let created = created.expect("the optimistic event is shown");
    assert_eq!(wallclock(&created.start), "2026-10-08 13:00");
    assert!(cx.update(|_, cx| !DraftState::read(cx).is_composing()));
}

#[gpui_kit::test]
fn right_clicking_an_event_opens_its_menu(cx: &mut TestAppContext) {
    let cx = open_view(cx, "week");
    let review = block(cx, "review");
    cx.simulate_mouse_down(review.center(), MouseButton::Right, Modifiers::default());
    cx.simulate_mouse_up(review.center(), MouseButton::Right, Modifiers::default());
    cx.run_until_parked();
    assert_eq!(
        cx.update(|_, cx| context_menu::highlighted(cx)),
        Some(key("review"))
    );
}

#[gpui_kit::test]
fn delete_asks_first_and_removes_the_event_at_once(cx: &mut TestAppContext) {
    let cx = open(cx);
    cx.update(|_, cx| super::popover::open_event(key("review"), None, cx));
    cx.run_until_parked();
    // Delete with no field focused asks.
    cx.simulate_keystrokes("delete");
    assert!(cx.update(|window, cx| {
        use gpui_kit::component::WindowExt;
        window.has_active_dialog(cx)
    }));
    cx.update(|window, cx| {
        use gpui_kit::component::WindowExt;
        window.close_dialog(cx);
    });

    let review = event(cx, "review").unwrap();
    cx.update(|_, cx| commands::delete(Scope::This, review, cx));
    cx.run_until_parked();
    assert!(event(cx, "review").is_none());
    assert!(form(cx).is_none(), "the popover closes with it");
}
