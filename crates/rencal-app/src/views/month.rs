//! The month view (port of `components/main/month-view/`): an endless
//! vertical stack of week rows on an `InfiniteAxis` whose items are weeks
//! counted from a fixed origin. Spec: `docs/scroll-behaviour.md` → Month view.
//!
//! - Scroll position and the active date are independent. Opening the view
//!   puts the week holding the 1st of the active month at the top; scrolling
//!   never changes the active date.
//! - A jump (`Navigation::version`) scrolls the active date's week to the top
//!   unless it is already fully visible, even when the date didn't change.
//! - User scrolls land on week rows (`WeekSnap`): touchpad flings land ahead,
//!   other scrolls settle after an idle pause. Snapping is off while a jump
//!   settles and with reduced motion.
//! - Events load for the visible months (plus a margin) and never block
//!   scrolling.
//! - Editing: blocks open the popover, drag to another day (keeping their
//!   time) and have a menu; empty cell background drags to create an
//!   all-day range, double-clicks or right-clicks to create after the day's
//!   last event. Dragging near the top or bottom auto-scrolls.

use std::collections::HashMap;
use std::rc::Rc;
use std::sync::Arc;
use std::time::Instant;

use chrono::{Datelike, NaiveDate};
use gpui_kit::component::{h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    AnyElement, App, Bounds, Context, ElementId, FontWeight, Hsla, InteractiveElement, IntoElement,
    ParentElement, Pixels, Render, ScrollDelta, ScrollWheelEvent, SharedString,
    StatefulInteractiveElement, Styled, Subscription, Task, TouchPhase, Window, div, px,
};
use rencal_layout::{
    MonthRowMetrics, MonthWeekLayout, all_day_bar_rect, month_week_layout, reserved_all_day_height,
};
use rencal_theme::ResolvedTheme;
use rencal_time::day::add_months_to_month_start;
use rencal_time::display::{DatePartStyle, format_month, format_time};
use rencal_time::{
    Calendar, CalendarEvent, FirstDayOfWeek, TimeFormat, Tz, date_from_epoch_day, epoch_day,
    iso_week_number, start_of_week,
};

use super::axis::{InfiniteAxis, LIFT_GAP, SETTLE_IDLE, WeekSnap, WheelAction, WheelPhase};
use super::interact::{self, AnchorAt, event_block, is_double_click, navigate_on_click};
use super::{EventRole, ViewEvents, measure, ring};
use crate::clock::Clock;
use crate::editing::context_menu;
use crate::editing::draft::{DayDraft, DraftState, last_event_end};
use crate::editing::drag::{self, DragState, FloatKind};
use crate::event_store::EventStore;
use crate::navigation::Navigation;
use crate::settings::Settings;
use crate::theme::{ThemeStore, hsla};
use crate::ui::anchors::{Anchors, EventSource, Named, drop_anchor, named_anchor, scroll_anchor};
use crate::ui::event_paint::{EventPaint, Rsvp, calendar_accent, event_paint, paint_for_accent};
use crate::ui::{Palette, Role, event_title, metric, radius, text_size};
use rencal_layout::drag::DropZone;

/// Week rows lay out at most this many all-day lanes.
const MAX_ALL_DAY_LANES: usize = 3;
/// Day cells list at most this many timed events.
const MAX_TIMED_VISIBLE: usize = 4;
/// Rows rendered beyond each edge of the viewport.
const OVERSCAN: i64 = 1;
/// Before the first measure (and the old `DEFAULT_ROW_HEIGHT`).
const DEFAULT_ROW_HEIGHT: f32 = 150.0;

pub const WEEKDAY_LABELS: [[&str; 7]; 2] = [
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
];

pub fn weekday_labels(first_day: FirstDayOfWeek) -> [&'static str; 7] {
    match first_day {
        FirstDayOfWeek::Monday => WEEKDAY_LABELS[0],
        FirstDayOfWeek::Sunday => WEEKDAY_LABELS[1],
    }
}

/// Epoch day of week row 0: 1970-01-05 is a Monday, 1970-01-04 a Sunday.
fn origin(first_day: FirstDayOfWeek) -> i32 {
    match first_day {
        FirstDayOfWeek::Monday => 4,
        FirstDayOfWeek::Sunday => 3,
    }
}

/// The week row holding `date`.
pub fn week_index(date: NaiveDate, first_day: FirstDayOfWeek) -> i64 {
    i64::from(epoch_day(start_of_week(date, first_day)) - origin(first_day)).div_euclid(7)
}

/// Epoch day of the first day in week row `index`.
pub fn week_start(index: i64, first_day: FirstDayOfWeek) -> i32 {
    origin(first_day) + (index * 7) as i32
}

pub struct MonthView {
    axis: InfiniteAxis,
    snap: WeekSnap,
    bounds: Bounds<Pixels>,
    first_day: FirstDayOfWeek,
    nav_version: u64,
    settle: Option<Task<()>>,
    lift: Option<Task<()>>,
    layouts: HashMap<i32, Rc<MonthWeekLayout>>,
    layouts_revision: (u64, u64, u64),
    requested: Option<(NaiveDate, NaiveDate)>,
    _subscriptions: Vec<Subscription>,
}

impl MonthView {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let first_day = Settings::global(cx).first_day_of_week();
        let nav = Navigation::global(cx).clone();
        let month_start = nav.active_date.with_day(1).expect("the 1st exists");
        let store = EventStore::global(cx);
        let draft = DraftState::global(cx);
        let subscriptions = vec![
            cx.observe(&store, |_, _, cx| cx.notify()),
            cx.observe(&draft, |_, _, cx| cx.notify()),
            cx.observe_global::<DragState>(|_, cx| cx.notify()),
            cx.observe_global_in::<Navigation>(window, |this, _, cx| this.navigated(cx)),
            cx.observe_global::<Settings>(|this, cx| this.settings_changed(cx)),
            cx.observe_global::<Clock>(|_, cx| cx.notify()),
        ];
        Self {
            axis: InfiniteAxis::new(week_index(month_start, first_day) as f64),
            snap: WeekSnap::new(Instant::now()),
            bounds: Bounds::default(),
            first_day,
            nav_version: nav.version,
            settle: None,
            lift: None,
            layouts: HashMap::new(),
            layouts_revision: (u64::MAX, 0, 0),
            requested: None,
            _subscriptions: subscriptions,
        }
    }

    /// The scroll position, in week rows from the origin (tests).
    #[cfg(test)]
    pub fn position(&self) -> f64 {
        self.axis.position()
    }

    #[cfg(test)]
    pub fn axis(&self) -> &InfiniteAxis {
        &self.axis
    }

    /// Scrolls without snapping, as an uninterrupted gesture would (tests).
    #[cfg(test)]
    pub fn scroll_for_test(&mut self, delta: f32) {
        self.axis.scroll_by(delta);
    }

    fn set_bounds(&mut self, bounds: Bounds<Pixels>) -> bool {
        if bounds == self.bounds {
            return false;
        }
        self.bounds = bounds;
        // Each day cell is a square: the row height tracks the column width.
        let row_height = (f32::from(bounds.size.width) / 7.0).round();
        let row_height = if row_height > 0.0 {
            row_height
        } else {
            DEFAULT_ROW_HEIGHT
        };
        self.axis
            .set_metrics(row_height, f32::from(bounds.size.height));
        true
    }

    fn snap_enabled(&self, cx: &App) -> bool {
        self.axis.is_measured() && !Navigation::is_navigating(cx) && !cx.reduce_motion()
    }

    fn navigated(&mut self, cx: &mut Context<Self>) {
        let nav = Navigation::global(cx);
        if nav.version == self.nav_version {
            cx.notify();
            return;
        }
        self.nav_version = nav.version;
        self.cancel_snap();
        let week = week_index(nav.active_date, self.first_day) as f64;
        if !self.axis.is_fully_visible(week, week + 1.0, 1.0) {
            self.axis.set_position(week);
        }
        cx.notify();
    }

    fn settings_changed(&mut self, cx: &mut Context<Self>) {
        let first_day = Settings::global(cx).first_day_of_week();
        if first_day != self.first_day {
            // Keep the same week at the top under the new row boundaries.
            let top = date_from_epoch_day(week_start(
                self.axis.position().floor() as i64,
                self.first_day,
            ));
            let fraction = self.axis.position().fract();
            self.first_day = first_day;
            self.axis
                .set_position(week_index(top, first_day) as f64 + fraction);
            self.layouts.clear();
        }
        cx.notify();
    }

    fn cancel_snap(&mut self) {
        self.snap.reset();
        self.settle = None;
        self.lift = None;
        self.axis.cancel_animation();
    }

    fn on_scroll(&mut self, event: &ScrollWheelEvent, window: &mut Window, cx: &mut Context<Self>) {
        if event.modifiers.control {
            return;
        }
        cx.stop_propagation();
        let precise = matches!(event.delta, ScrollDelta::Pixels(_));
        let delta = -f32::from(event.delta.pixel_delta(window.line_height()).y);
        let phase = match event.touch_phase {
            TouchPhase::Started => WheelPhase::Started,
            TouchPhase::Ended => WheelPhase::Ended,
            TouchPhase::Moved | TouchPhase::Cancelled => WheelPhase::Moved,
        };
        if delta == 0.0 && phase == WheelPhase::Moved {
            return;
        }
        let now = Instant::now();
        match self.snap.on_wheel(now, f64::from(delta), precise, phase) {
            WheelAction::Swallow => return,
            action => {
                self.axis.scroll_by(delta);
                self.schedule_settle(cx);
                if action == WheelAction::ScrollThenLift {
                    self.lifted(cx);
                } else if precise && !cfg!(target_os = "macos") {
                    self.schedule_lift(cx);
                }
            }
        }
        cx.notify();
    }

    fn schedule_settle(&mut self, cx: &mut Context<Self>) {
        self.settle = Some(cx.spawn(async move |this, cx| {
            cx.background_executor().timer(SETTLE_IDLE).await;
            this.update(cx, |this, cx| this.settle(cx)).ok();
        }));
    }

    fn schedule_lift(&mut self, cx: &mut Context<Self>) {
        self.lift = Some(cx.spawn(async move |this, cx| {
            cx.background_executor().timer(LIFT_GAP).await;
            this.update(cx, |this, cx| this.lifted(cx)).ok();
        }));
    }

    /// The finger left the touchpad: fling ahead if it was moving fast.
    fn lifted(&mut self, cx: &mut Context<Self>) {
        self.lift = None;
        let row = f64::from(self.axis.item_size());
        let fling = self.snap.fling(self.axis.offset(), row);
        if !self.snap_enabled(cx) {
            return;
        }
        if let Some(fling) = fling {
            self.axis.start_snap(fling, Instant::now());
            cx.notify();
        }
    }

    /// No input for a while: land on the nearest week row.
    fn settle(&mut self, cx: &mut Context<Self>) {
        self.settle = None;
        if !self.snap_enabled(cx) || self.axis.is_animating() {
            return;
        }
        if let Some(fling) = WeekSnap::settle(self.axis.offset(), f64::from(self.axis.item_size()))
        {
            self.axis.start_snap(fling, Instant::now());
            cx.notify();
        }
    }

    fn layout(&mut self, events: &[CalendarEvent], start: i32) -> Rc<MonthWeekLayout> {
        self.layouts
            .entry(start)
            .or_insert_with(|| Rc::new(month_week_layout(events, start)))
            .clone()
    }

    /// Keeps the loaded range a couple of months around what's visible.
    fn request_events(&mut self, first: NaiveDate, last: NaiveDate, cx: &mut Context<Self>) {
        let range = (
            add_months_to_month_start(first, -1),
            add_months_to_month_start(last, 2),
        );
        if self.requested == Some(range) {
            return;
        }
        self.requested = Some(range);
        cx.defer(move |cx| EventStore::ensure_loaded(range.0, range.1, cx));
    }
}

impl Render for MonthView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.axis.tick(Instant::now()) {
            window.request_animation_frame();
        }

        let theme = ThemeStore::active(cx);
        let view = ViewEvents::read(true, cx);
        let create_color = {
            let calendar = DraftState::default_calendar_id(cx)
                .and_then(|slug| EventStore::global(cx).read(cx).calendar(&slug).cloned());
            paint_for_accent(calendar_accent(calendar.as_ref(), &theme), &theme).create_selection
        };
        let store = EventStore::global(cx).read(cx);
        let events = view.events.clone();
        let calendars = store.calendars().clone();
        let highlighted = [
            store.active_event().cloned(),
            store.selected_event().cloned(),
            context_menu::highlighted(cx),
        ];
        if view.revision != self.layouts_revision {
            self.layouts_revision = view.revision;
            self.layouts.clear();
        }
        let settings = Settings::global(cx);
        let clock = *Clock::global(cx);
        let ctx = RowContext {
            view,
            create_color,
            palette: Palette::new(&theme),
            boundary: hsla(theme.color("text").mix(0.28, theme.color("background"))),
            numerical: Role::Numerical.family(cx),
            metrics: MonthRowMetrics {
                row_width: f32::from(self.bounds.size.width),
                lane_height: theme.number("month.lane_height") as f32,
                padding_inline: theme.number("month.padding_x") as f32,
            },
            row_height: px(self.axis.item_size().max(1.0)),
            today: clock.today,
            viewer: clock.viewer,
            active_date: Navigation::active_date(cx),
            show_week_numbers: settings.rencal.show_week_numbers,
            first_day: self.first_day,
            time_format: settings.time_format(),
            theme: theme.clone(),
            calendars,
            highlighted,
        };

        let rows = if self.axis.is_measured() {
            let range = self.axis.visible_range(OVERSCAN);
            let first = date_from_epoch_day(week_start(range.start, self.first_day));
            let last = date_from_epoch_day(week_start(range.end, self.first_day));
            self.request_events(first, last, cx);
            range
                .map(|index| {
                    let start = week_start(index, self.first_day);
                    let layout = self.layout(&events, start);
                    week_row(&ctx, &events, &layout, start)
                        .absolute()
                        .left_0()
                        .top(px(self.axis.offset_of(index)))
                        .w_full()
                        .into_any_element()
                })
                .collect()
        } else {
            Vec::new()
        };

        let labels = weekday_labels(self.first_day);
        v_flex()
            .size_full()
            .child(
                h_flex()
                    .flex_shrink_0()
                    .border_b_1()
                    .border_color(ctx.palette.border)
                    .children(labels.into_iter().map(|label| {
                        let weekend = label == "Sat" || label == "Sun";
                        div()
                            .flex_1()
                            .py_2()
                            .text_center()
                            .text_size(text_size(&theme, "2xs"))
                            .font_family(ctx.numerical.clone())
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(ctx.palette.muted)
                            .when(weekend, |this| this.bg(ctx.palette.weekend))
                            .child(label.to_uppercase())
                    })),
            )
            .child(
                div()
                    .id("month-scroll")
                    .relative()
                    .flex_1()
                    .min_h_0()
                    .overflow_hidden()
                    .on_scroll_wheel(cx.listener(Self::on_scroll))
                    .child(measure(cx.entity().downgrade(), Self::set_bounds))
                    .child(scroll_anchor(false, true, {
                        let weak = cx.entity().downgrade();
                        Rc::new(move |delta, cx| {
                            weak.update(cx, |this, cx| {
                                this.axis.scroll_by(delta.y);
                                cx.notify();
                            })
                            .ok();
                        })
                    }))
                    .children(rows),
            )
    }
}

/// What every row of one render shares.
struct RowContext {
    view: ViewEvents,
    create_color: Hsla,
    palette: Palette,
    boundary: Hsla,
    numerical: SharedString,
    metrics: MonthRowMetrics,
    row_height: Pixels,
    today: NaiveDate,
    viewer: Tz,
    active_date: NaiveDate,
    show_week_numbers: bool,
    first_day: FirstDayOfWeek,
    time_format: TimeFormat,
    theme: Arc<ResolvedTheme>,
    calendars: Arc<Vec<Calendar>>,
    highlighted: [Option<rencal_time::EventKey>; 3],
}

impl RowContext {
    fn is_highlighted(&self, event: &CalendarEvent) -> bool {
        let key = event.key();
        self.highlighted.iter().any(|k| k.as_ref() == Some(&key))
    }

    fn paint(&self, event: &CalendarEvent) -> EventPaint {
        event_paint(event, &self.calendars, &self.theme)
    }
}

/// A day column's position in a week row, for the right-hand divider.
fn is_last(col: usize) -> bool {
    col == 6
}

fn week_row(
    ctx: &RowContext,
    events: &[CalendarEvent],
    layout: &MonthWeekLayout,
    start: i32,
) -> gpui_kit::Stateful<gpui_kit::Div> {
    let palette = &ctx.palette;
    let days: Vec<NaiveDate> = (0..7).map(|col| date_from_epoch_day(start + col)).collect();
    let month_start_col = days.iter().position(|day| day.day() == 1);
    let lane_height = ctx.metrics.lane_height;

    let visible_items: Vec<_> = layout
        .all_day_items
        .iter()
        .filter(|item| item.lane < MAX_ALL_DAY_LANES)
        .collect();
    // A day only leaves room for the bars that actually span it.
    let mut reserved = [0usize; 7];
    for item in &visible_items {
        for slot in &mut reserved[item.span.start_col..item.span.end_col.min(7)] {
            *slot = (*slot).max(item.lane + 1);
        }
    }

    let boundary = |header: bool| -> Option<AnyElement> {
        let col = month_start_col?;
        if col == 0 {
            // The month starts the row: a bar across its top.
            return header.then(|| {
                div()
                    .absolute()
                    .top(px(-1.))
                    .left_0()
                    .right_0()
                    .h(px(3.))
                    .bg(ctx.boundary)
                    .into_any_element()
            });
        }
        let left = ctx.metrics.row_width * col as f32 / 7.0 - 1.0;
        Some(
            div()
                .absolute()
                .top_0()
                .bottom_0()
                .left(px(left))
                .w(px(2.))
                .bg(ctx.boundary)
                .into_any_element(),
        )
    };

    let header = h_flex()
        .relative()
        .flex_shrink_0()
        .font_family(ctx.numerical.clone())
        .when(ctx.show_week_numbers, |this| {
            this.child(
                div()
                    .absolute()
                    .left_1()
                    .top_1()
                    .line_height(px(18.))
                    .text_size(text_size(&ctx.theme, "2xs"))
                    .text_color(palette.muted)
                    .child(iso_week_number(days[0], ctx.first_day).to_string()),
            )
        })
        .children(
            days.iter()
                .enumerate()
                .map(|(col, &date)| day_header(ctx, date, col)),
        )
        .children(boundary(true));

    let cells_area = div()
        .relative()
        .flex_1()
        .min_h_0()
        .flex()
        .children(days.iter().enumerate().map(|(col, &date)| {
            let timed = &layout.timed_by_col[col];
            let covering = layout
                .all_day_items
                .iter()
                .filter(|item| item.span.start_col <= col && item.span.end_col > col)
                .count();
            let hidden_all_day = covering
                - visible_items
                    .iter()
                    .filter(|item| item.span.start_col <= col && item.span.end_col > col)
                    .count();
            day_cell(
                ctx,
                events,
                date,
                col,
                timed,
                hidden_all_day,
                reserved[col],
                lane_height,
            )
        }))
        .children(boundary(false))
        .children(visible_items.iter().map(|item| {
            let event = &events[item.event];
            let role = ctx.view.role(item.event);
            let rect = all_day_bar_rect(&item.span, item.lane, &ctx.metrics);
            let fills_row = item.span.end_col - item.span.start_col == 7;
            all_day_bar(
                ctx,
                event,
                role,
                item.span.is_start,
                item.span.is_end,
                fills_row,
                rect,
            )
        }));

    v_flex()
        .id(("month-week", start as u64))
        .h(ctx.row_height)
        .border_b_1()
        .border_color(palette.border)
        .child(header)
        .child(cells_area)
}

fn day_header(ctx: &RowContext, date: NaiveDate, col: usize) -> impl IntoElement + use<> {
    let palette = ctx.palette;
    let active = date == ctx.active_date;
    let today = date == ctx.today;
    let weekend = date.weekday().number_from_monday() >= 6;
    let theme = &ctx.theme;
    div()
        .id(("month-day-header", epoch_day(date) as u64))
        .flex_1()
        .min_w_0()
        .flex()
        .items_center()
        .justify_end()
        .gap_1()
        .p_1()
        .when(!is_last(col), |this| {
            this.border_r_1().border_color(palette.border)
        })
        .when(weekend, |this| this.bg(palette.weekend))
        .when(active, |this| {
            this.bg(palette.selected).text_color(palette.selected_text)
        })
        .on_click(navigate_on_click(date))
        .on_mouse_down(gpui_kit::MouseButton::Left, move |e, window, cx| {
            drag::press_create_days(date, e.position, window, cx)
        })
        .when(date.day() == 1 || active, |this| {
            this.child(
                div()
                    .text_size(text_size(theme, "xs"))
                    .text_color(palette.muted)
                    .child(Role::Numerical.text(theme, format_month(date, DatePartStyle::Long))),
            )
        })
        .child(
            div()
                .size(px(20.))
                .flex()
                .items_center()
                .justify_center()
                .text_size(text_size(theme, "xs"))
                .when(today, |this| {
                    this.bg(palette.today)
                        .text_color(palette.today_text)
                        .rounded(crate::ui::radius_circle(theme))
                })
                .when(active && !today, |this| {
                    this.bg(palette.selected)
                        .text_color(palette.selected_text)
                        .rounded(crate::ui::radius_circle(theme))
                })
                .child(date.day().to_string()),
        )
}

#[allow(clippy::too_many_arguments)]
fn day_cell(
    ctx: &RowContext,
    events: &[CalendarEvent],
    date: NaiveDate,
    col: usize,
    timed: &[usize],
    hidden_all_day: usize,
    reserved_lanes: usize,
    lane_height: f32,
) -> impl IntoElement + use<> {
    let palette = ctx.palette;
    let theme = &ctx.theme;
    let active = date == ctx.active_date;
    let weekend = date.weekday().number_from_monday() >= 6;
    let hidden = hidden_all_day + timed.len().saturating_sub(MAX_TIMED_VISIBLE);
    div()
        .id(("month-day", epoch_day(date) as u64))
        .flex_1()
        .min_w_0()
        .h_full()
        .flex()
        .flex_col()
        .gap_1()
        .px(metric(theme, "month.padding_x"))
        .pb_1()
        .overflow_hidden()
        .when(!is_last(col), |this| {
            this.border_r_1().border_color(palette.border)
        })
        .when(weekend, |this| this.bg(palette.weekend))
        .when(active, |this| {
            this.bg(palette.selected).text_color(palette.selected_text)
        })
        .child(drop_anchor(DropZone::Day, date))
        .when(active, |this| this.child(named_anchor(Named::ActiveDay)))
        .on_mouse_down(gpui_kit::MouseButton::Left, move |e, window, cx| {
            drag::press_create_days(date, e.position, window, cx)
        })
        .on_mouse_down(gpui_kit::MouseButton::Right, move |e, window, cx| {
            interact::day_menu(e.position, window, cx, move |_, cx| {
                create_after_last(date, cx)
            });
        })
        .on_click(move |e, window, cx| {
            if is_double_click(e) {
                if Anchors::event_at(e.position(), cx).is_none() {
                    create_after_last(date, cx);
                }
            } else {
                navigate_on_click(date)(e, window, cx);
            }
        })
        .children(
            reserved_all_day_height(reserved_lanes, lane_height)
                .map(|height| div().flex_shrink_0().h(px(height))),
        )
        .children(
            timed
                .iter()
                .take(MAX_TIMED_VISIBLE)
                .map(|&index| timed_event(ctx, &events[index], ctx.view.role(index))),
        )
        .when(hidden > 0, |this| {
            this.child(
                div()
                    .flex_shrink_0()
                    .px_0p5()
                    .truncate()
                    .text_size(text_size(theme, "xs"))
                    .text_color(palette.muted)
                    .child(format!("+{hidden} more")),
            )
        })
}

/// A new event on `date` after its last timed event (the cell's "Create
/// event" and double click), anchored at the cell.
fn create_after_last(date: NaiveDate, cx: &mut App) {
    let viewer = Clock::global(cx).viewer;
    let events = EventStore::global(cx).read(cx).events().clone();
    let anchor = Anchors::drop_for(DropZone::Day, date, cx).map(|cell| cell.bounds);
    DraftState::open_day_draft(
        date,
        anchor,
        DayDraft {
            start: last_event_end(date, &events, viewer),
            ..DayDraft::default()
        },
        cx,
    );
}

fn timed_event(ctx: &RowContext, event: &CalendarEvent, role: EventRole) -> AnyElement {
    let palette = ctx.palette;
    let theme = &ctx.theme;
    let paint = ctx.paint(event);
    let highlighted = ctx.is_highlighted(event);
    let rsvp = Rsvp::of(event, &ctx.calendars);
    let pad = metric(theme, "event.padding_x");
    let draft = role == EventRole::Draft;
    let row = h_flex()
        .id(ElementId::Name(event.key().0.into()))
        .relative()
        .flex_shrink_0()
        .h(crate::ui::line_height(theme, "xs"))
        .items_center()
        .gap(pad)
        .pr(pad)
        .overflow_hidden()
        .rounded(radius(theme, 0.4))
        .text_size(text_size(theme, "xs"))
        .opacity(ctx.view.opacity(event, role))
        .map(|this| match role {
            EventRole::Draft => this
                .border_1()
                .border_dashed()
                .border_color(paint.color)
                .bg(paint.draft_fill)
                .text_color(paint.draft_text)
                .font_weight(FontWeight::MEDIUM),
            EventRole::Preview => this
                .bg(paint.fill)
                .text_color(paint.text)
                .shadow(ring(paint.color, 1.5)),
            _ if highlighted => this.bg(palette.selected).text_color(palette.selected_text),
            _ => this.hover(move |style| style.bg(palette.hover)),
        })
        .when(role == EventRole::Normal && Rsvp::is_faded(rsvp), |this| {
            this.opacity(0.5)
        })
        .when(
            role == EventRole::Normal && rsvp == Some(Rsvp::Declined),
            |this| this.line_through(),
        )
        .when(!draft, |this| {
            this.child(div().w(px(2.)).h_full().flex_shrink_0().bg(paint.color))
        })
        .child(
            div()
                .flex_shrink_0()
                .text_size(text_size(theme, "2xs"))
                .font_family(ctx.numerical.clone())
                .when(!highlighted && role == EventRole::Normal, |this| {
                    this.text_color(paint.tinted_text)
                })
                .child(Role::Numerical.text(
                    theme,
                    &format_time(&event.start, ctx.time_format, ctx.viewer),
                )),
        )
        .child(
            div()
                .min_w_0()
                .truncate()
                .child(event_title(&event.summary, palette.muted)),
        );
    event_block(
        row,
        event,
        EventSource::View,
        Some(FloatKind::Pill),
        AnchorAt::Block,
        !role.is_static(),
    )
    .into_any_element()
}

fn all_day_bar(
    ctx: &RowContext,
    event: &CalendarEvent,
    role: EventRole,
    is_start: bool,
    is_end: bool,
    fills_row: bool,
    rect: rencal_layout::Rect,
) -> AnyElement {
    let theme = &ctx.theme;
    let paint = ctx.paint(event);
    let highlighted = ctx.is_highlighted(event);
    let rsvp = Rsvp::of(event, &ctx.calendars);
    let faded = role == EventRole::Normal && Rsvp::is_faded(rsvp);
    let corner = radius(theme, 0.4);
    let bar = div()
        .id(ElementId::Name(format!("bar:{}", event.key().0).into()))
        .absolute()
        .left(px(rect.left))
        .top(px(rect.top))
        .w(px(rect.width()))
        .h(px(rect.height()))
        .flex()
        .items_center()
        .overflow_hidden()
        .px(metric(theme, "event.padding_x"))
        .text_size(text_size(theme, "xs"))
        .when(is_start, |this| this.rounded_l(corner))
        .when(is_end, |this| this.rounded_r(corner))
        .opacity(ctx.view.opacity(event, role))
        .map(|this| match role {
            EventRole::Selection => this.bg(ctx.create_color),
            EventRole::Draft => this
                .border_1()
                .border_dashed()
                .border_color(paint.color)
                .bg(paint.draft_fill)
                .text_color(paint.draft_text)
                .font_weight(FontWeight::MEDIUM),
            EventRole::Preview => this
                .bg(paint.fill)
                .text_color(paint.text)
                .shadow(ring(paint.color, 1.5)),
            _ if faded => this
                .border_1()
                .border_dashed()
                .border_color(paint.color)
                .text_color(paint.declined_text)
                .opacity(0.5),
            _ => this
                .bg(if highlighted {
                    paint.selected_fill
                } else {
                    paint.fill
                })
                .text_color(paint.text),
        })
        .when(
            role == EventRole::Normal && rsvp == Some(Rsvp::Declined),
            |this| this.line_through(),
        )
        .when(role != EventRole::Selection, |this| {
            this.child(
                div()
                    .min_w_0()
                    .truncate()
                    .child(event_title(&event.summary, ctx.palette.muted)),
            )
        });
    event_block(
        bar,
        event,
        EventSource::View,
        Some(FloatKind::Pill),
        if fills_row {
            AnchorAt::Pointer
        } else {
            AnchorAt::Block
        },
        !role.is_static(),
    )
    .into_any_element()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn week_rows_count_from_a_fixed_origin() {
        let date = |s: &str| s.parse::<NaiveDate>().unwrap();
        for first_day in [FirstDayOfWeek::Monday, FirstDayOfWeek::Sunday] {
            let index = week_index(date("2026-10-07"), first_day);
            let start = date_from_epoch_day(week_start(index, first_day));
            assert_eq!(start, start_of_week(date("2026-10-07"), first_day));
            // Before the origin too.
            let index = week_index(date("1969-12-31"), first_day);
            let start = date_from_epoch_day(week_start(index, first_day));
            assert_eq!(start, start_of_week(date("1969-12-31"), first_day));
        }
        assert_eq!(
            week_index(date("2026-10-11"), FirstDayOfWeek::Monday) + 1,
            week_index(date("2026-10-12"), FirstDayOfWeek::Monday)
        );
    }
}
