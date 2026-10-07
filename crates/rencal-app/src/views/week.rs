//! The week view (port of `components/main/week-view/`): an endless
//! horizontal strip of day columns on an `InfiniteAxis` of days since
//! 1970-01-01, over a fixed 24-hour time grid that scrolls vertically.
//! Spec: `docs/scroll-behaviour.md` → Week view.
//!
//! - Seven days fit the width (no narrower than `DAY_WIDTH_MIN`). Opening the
//!   view puts the first day of the active date's week at the left, and the
//!   grid at the current time (when today is near) or 08:00.
//! - A jump smooth-scrolls the active day's week in unless the day is already
//!   fully visible; scrolling never changes the active date.
//! - Events load for the visible days plus a week each side and never block
//!   scrolling.

use std::sync::Arc;
use std::time::Instant;

use chrono::{Datelike, Duration as Days, NaiveDate, Timelike};
use gpui_kit::component::h_flex;
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    AnyElement, App, Bounds, BoxShadow, Context, ElementId, FontWeight, Hsla, InteractiveElement,
    IntoElement, ParentElement, Pixels, Render, ScrollWheelEvent, SharedString,
    StatefulInteractiveElement, Styled, Subscription, Window, div, point, px,
};
use rencal_layout::{DayRangeLayout, DisplayMode, TimedPlacement, day_range_layout};
use rencal_theme::{Fill, ResolvedTheme, Slot};
use rencal_time::display::{DatePartStyle, format_time, format_wallclock_time, format_weekday};
use rencal_time::{
    Calendar, CalendarEvent, EventKey, TimeFormat, Tz, date_from_epoch_day, epoch_day,
    start_of_week,
};

use super::axis::InfiniteAxis;
use super::measure;
use crate::clock::Clock;
use crate::event_store::EventStore;
use crate::navigation::{Navigation, ScrollBehavior};
use crate::settings::Settings;
use crate::theme::{ThemeStore, hsla};
use crate::ui::event_paint::{Rsvp, event_paint};
use crate::ui::{Palette, Role, event_title, metric, radius, radius_circle, text_size};

const HOUR_HEIGHT: f32 = 48.0;
const GRID_HEIGHT: f32 = 24.0 * HOUR_HEIGHT;
pub const GUTTER_WIDTH: f32 = 48.0;
const DAY_WIDTH_MIN: f32 = 100.0;
/// The day-header row: a 28px day number with 2px padding above, 1px below.
const HEADER_HEIGHT: f32 = 31.0;
/// One all-day lane: an 18px bar with 1px above and below.
const LANE_HEIGHT: f32 = 20.0;
/// Each overlap depth indents a timed block by this share of the column.
const CASCADE_OFFSET: f32 = 0.15;
/// Space right of every timed block, so the column stays clickable.
const BLOCK_RIGHT_GAP: f32 = 12.0;
/// Days laid out beyond each edge of the viewport.
const OVERSCAN_DAYS: i64 = 7;

pub struct WeekView {
    axis: InfiniteAxis,
    /// Vertical offset of the time grid, in px.
    grid_scroll: f32,
    bounds: Bounds<Pixels>,
    nav_version: u64,
    layout: Option<CachedLayout>,
    requested: Option<(NaiveDate, NaiveDate)>,
    _subscriptions: Vec<Subscription>,
}

struct CachedLayout {
    revision: u64,
    first_day: i32,
    day_count: usize,
    layout: Arc<DayRangeLayout>,
}

impl WeekView {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let nav = Navigation::global(cx).clone();
        let first_day = Settings::global(cx).first_day_of_week();
        let clock = *Clock::global(cx);
        let week_start = start_of_week(nav.active_date, first_day);
        // The strip used to render the active week plus a week each side.
        let near_today =
            (week_start - Days::days(7)..week_start + Days::days(14)).contains(&clock.today);
        let target_hour = if near_today {
            let now = clock.now.with_timezone(&clock.viewer);
            now.hour() as f32 + now.minute() as f32 / 60.0
        } else {
            8.0
        };
        let store = EventStore::global(cx);
        let subscriptions = vec![
            cx.observe(&store, |_, _, cx| cx.notify()),
            cx.observe_global_in::<Navigation>(window, |this, _, cx| this.navigated(cx)),
            cx.observe_global::<Settings>(|_, cx| cx.notify()),
            cx.observe_global::<Clock>(|_, cx| cx.notify()),
        ];
        Self {
            axis: InfiniteAxis::new(f64::from(epoch_day(week_start))),
            grid_scroll: (target_hour * HOUR_HEIGHT - 16.0).max(0.0),
            bounds: Bounds::default(),
            nav_version: nav.version,
            layout: None,
            requested: None,
            _subscriptions: subscriptions,
        }
    }

    /// The first visible day, as an epoch day (tests).
    #[cfg(test)]
    pub fn position(&self) -> f64 {
        self.axis.position()
    }

    fn set_bounds(&mut self, bounds: Bounds<Pixels>) -> bool {
        if bounds == self.bounds {
            return false;
        }
        self.bounds = bounds;
        let days_width = (f32::from(bounds.size.width) - GUTTER_WIDTH).max(0.0);
        let day_width = (days_width / 7.0).max(DAY_WIDTH_MIN);
        self.axis.set_metrics(day_width, days_width);
        true
    }

    fn navigated(&mut self, cx: &mut Context<Self>) {
        let nav = Navigation::global(cx).clone();
        if nav.version == self.nav_version {
            cx.notify();
            return;
        }
        self.nav_version = nav.version;
        let day = f64::from(epoch_day(nav.active_date));
        if !self.axis.is_fully_visible(day, day + 1.0, 1.0) {
            let first_day = Settings::global(cx).first_day_of_week();
            let week_start = f64::from(epoch_day(start_of_week(nav.active_date, first_day)));
            let smooth = nav.behavior == ScrollBehavior::Smooth && !cx.reduce_motion();
            self.axis.scroll_to(week_start, smooth, Instant::now());
        }
        cx.notify();
    }

    fn on_scroll(&mut self, event: &ScrollWheelEvent, window: &mut Window, cx: &mut Context<Self>) {
        cx.stop_propagation();
        let delta = event.delta.pixel_delta(window.line_height());
        self.axis.scroll_by(-f32::from(delta.x));
        let grid_viewport = f32::from(self.bounds.size.height) - self.header_height();
        let max_scroll = (GRID_HEIGHT - grid_viewport).max(0.0);
        self.grid_scroll = (self.grid_scroll - f32::from(delta.y)).clamp(0.0, max_scroll);
        cx.notify();
    }

    fn header_height(&self) -> f32 {
        HEADER_HEIGHT + self.all_day_height()
    }

    fn all_day_height(&self) -> f32 {
        match &self.layout {
            Some(cached) if cached.layout.all_day_lanes > 0 => {
                // Edge tracks pad the lanes to match the gap between them.
                1.0 + cached.layout.all_day_lanes as f32 * LANE_HEIGHT + 2.0
            }
            _ => 0.0,
        }
    }

    fn layout(
        &mut self,
        events: &[CalendarEvent],
        revision: u64,
        first_day: i32,
        day_count: usize,
    ) -> Arc<DayRangeLayout> {
        match &self.layout {
            Some(cached)
                if cached.revision == revision
                    && cached.first_day == first_day
                    && cached.day_count == day_count =>
            {
                cached.layout.clone()
            }
            _ => {
                let layout = Arc::new(day_range_layout(events, first_day, day_count));
                self.layout = Some(CachedLayout {
                    revision,
                    first_day,
                    day_count,
                    layout: layout.clone(),
                });
                layout
            }
        }
    }

    /// Keeps the loaded range a week beyond the visible days, in whole weeks.
    fn request_events(&mut self, first: i32, last: i32, cx: &mut Context<Self>) {
        let start = date_from_epoch_day(first - 7);
        let end = date_from_epoch_day(last + 8);
        let range = (
            start - Days::days(i64::from(start.weekday().num_days_from_monday())),
            end + Days::days(i64::from(7 - end.weekday().num_days_from_monday()) % 7),
        );
        if self.requested == Some(range) {
            return;
        }
        self.requested = Some(range);
        cx.defer(move |cx| EventStore::ensure_loaded(range.0, range.1, cx));
    }
}

/// What the columns of one render share.
struct Frame {
    palette: Palette,
    theme: Arc<ResolvedTheme>,
    numerical: SharedString,
    calendars: Arc<Vec<Calendar>>,
    highlighted: [Option<EventKey>; 2],
    today: NaiveDate,
    active_date: NaiveDate,
    viewer: Tz,
    time_format: TimeFormat,
    now_minutes: f32,
    day_width: f32,
}

impl Frame {
    fn is_highlighted(&self, event: &CalendarEvent) -> bool {
        let key = event.key();
        self.highlighted.iter().any(|k| k.as_ref() == Some(&key))
    }

    fn day_background(&self, date: NaiveDate) -> Option<Hsla> {
        if date == self.active_date {
            Some(self.palette.selected)
        } else if date.weekday().number_from_monday() >= 6 {
            Some(self.palette.weekend)
        } else {
            None
        }
    }
}

impl Render for WeekView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.axis.tick(Instant::now()) {
            window.request_animation_frame();
        }

        let theme = ThemeStore::active(cx);
        let store = EventStore::global(cx).read(cx);
        let events = store.events().clone();
        let revision = store.revision();
        let clock = *Clock::global(cx);
        let now = clock.now.with_timezone(&clock.viewer);
        let frame = Frame {
            palette: Palette::new(&theme),
            numerical: Role::Numerical.family(cx),
            calendars: store.calendars().clone(),
            highlighted: [
                store.active_event().cloned(),
                store.selected_event().cloned(),
            ],
            today: clock.today,
            active_date: Navigation::active_date(cx),
            viewer: clock.viewer,
            time_format: Settings::global(cx).time_format(),
            now_minutes: (now.hour() * 60 + now.minute()) as f32,
            day_width: self.axis.item_size(),
            theme: theme.clone(),
        };

        let measured = self.axis.is_measured();
        let visible = self.axis.visible_range(0);
        let (first_day, day_count) = (
            (visible.start - OVERSCAN_DAYS) as i32,
            (visible.end - visible.start + 2 * OVERSCAN_DAYS) as usize,
        );
        let layout = measured.then(|| self.layout(&events, revision, first_day, day_count));
        if measured {
            self.request_events(visible.start as i32, visible.end as i32, cx);
        }
        let header_height = self.header_height();
        let grid_viewport = f32::from(self.bounds.size.height) - header_height;
        self.grid_scroll = self
            .grid_scroll
            .clamp(0.0, (GRID_HEIGHT - grid_viewport).max(0.0));

        let days: Vec<(i64, NaiveDate, f32)> = if measured {
            self.axis
                .visible_range(1)
                .map(|index| {
                    let left = GUTTER_WIDTH + self.axis.offset_of(index);
                    (index, date_from_epoch_day(index as i32), left)
                })
                .collect()
        } else {
            Vec::new()
        };
        let palette = frame.palette;

        let mut grid: Vec<AnyElement> = Vec::new();
        let mut header: Vec<AnyElement> = Vec::new();
        if let Some(layout) = &layout {
            let fill = match theme.slot(Slot::WeekGrid, None).fill {
                Some(Fill::Solid(color)) => Some(hsla(color)),
                Some(Fill::Gradient { from, .. }) => Some(hsla(from)),
                None => None,
            };
            // Column backgrounds and dividers.
            for &(_, date, left) in &days {
                grid.push(
                    div()
                        .id(("week-day", epoch_day(date) as u64))
                        .absolute()
                        .top_0()
                        .left(px(left))
                        .w(px(frame.day_width))
                        .h(px(GRID_HEIGHT))
                        .border_r_1()
                        .border_color(palette.border)
                        .when_some(fill, |this, fill| this.bg(fill))
                        .when_some(frame.day_background(date), |this, bg| this.bg(bg))
                        .on_click(move |_, _, cx| Navigation::navigate_to(date, None, cx))
                        .into_any_element(),
                );
            }
            // Hour lines over every column.
            let hour_line = theme.color("week_grid.hour_line");
            let half_hour_line = theme.color("week_grid.half_hour_line");
            for hour in 1..=24 {
                let y = hour as f32 * HOUR_HEIGHT;
                grid.push(line(y - 1.0, hsla(hour_line)));
                if half_hour_line.a > 0.0 {
                    grid.push(line(y - HOUR_HEIGHT / 2.0 - 1.0, hsla(half_hour_line)));
                }
            }
            // Timed events, per column.
            for &(index, date, left) in &days {
                let column = (index - i64::from(first_day)) as usize;
                let Some(placements) = layout.timed_by_day.get(column) else {
                    continue;
                };
                let mut placements: Vec<&TimedPlacement> = placements.iter().collect();
                // Later overlap columns draw over earlier ones.
                placements.sort_by_key(|p| p.column);
                for placement in placements {
                    grid.push(timed_block(
                        &frame,
                        &events[placement.event],
                        placement,
                        left,
                    ));
                }
                if date == frame.today {
                    grid.push(current_time(&frame, left));
                }
            }

            // Day headers.
            for &(_, date, left) in &days {
                header.push(day_header(&frame, date, left).into_any_element());
            }
            if layout.all_day_lanes > 0 {
                let height = self.all_day_height();
                for &(_, date, left) in &days {
                    header.push(
                        div()
                            .id(("week-all-day", epoch_day(date) as u64))
                            .absolute()
                            .top(px(HEADER_HEIGHT))
                            .left(px(left))
                            .w(px(frame.day_width))
                            .h(px(height))
                            .border_r_1()
                            .border_color(palette.border)
                            .when_some(frame.day_background(date), |this, bg| this.bg(bg))
                            .on_click(move |_, _, cx| Navigation::navigate_to(date, None, cx))
                            .into_any_element(),
                    );
                }
                for item in &layout.all_day_items {
                    let left = GUTTER_WIDTH
                        + self
                            .axis
                            .offset_of(i64::from(first_day) + item.span.start_col as i64);
                    let right = GUTTER_WIDTH
                        + self
                            .axis
                            .offset_of(i64::from(first_day) + item.span.end_col as i64);
                    if right < GUTTER_WIDTH || left > f32::from(self.bounds.size.width) {
                        continue;
                    }
                    let top = HEADER_HEIGHT + 1.0 + item.lane as f32 * LANE_HEIGHT;
                    header.push(all_day_bar(&frame, &events[item.event], left, right, top));
                }
            }
        }

        let gutter_labels = (1..24).map(|hour| {
            div()
                .absolute()
                .right(px(6.))
                .top(px(hour as f32 * HOUR_HEIGHT - 6.0))
                .text_size(text_size(&theme, "2xs"))
                .line_height(px(12.))
                .font_family(frame.numerical.clone())
                .text_color(palette.muted)
                .child(
                    Role::Numerical
                        .text(&theme, &format_wallclock_time(hour, 0, frame.time_format)),
                )
        });

        div()
            .id("week-scroll")
            .relative()
            .size_full()
            .overflow_hidden()
            .on_scroll_wheel(cx.listener(Self::on_scroll))
            .child(measure(cx.entity().downgrade(), Self::set_bounds))
            // The time grid, under the header.
            .child(
                div()
                    .absolute()
                    .top(px(header_height))
                    .left_0()
                    .right_0()
                    .bottom_0()
                    .overflow_hidden()
                    .child(
                        div()
                            .absolute()
                            .top(px(-self.grid_scroll))
                            .left_0()
                            .right_0()
                            .h(px(GRID_HEIGHT))
                            .children(grid)
                            // The gutter stays put horizontally.
                            .child(
                                div()
                                    .absolute()
                                    .top_0()
                                    .left_0()
                                    .w(px(GUTTER_WIDTH))
                                    .h(px(GRID_HEIGHT))
                                    .bg(palette.background)
                                    .border_r_1()
                                    .border_color(palette.border)
                                    .children(gutter_labels),
                            ),
                    ),
            )
            // The header: day names and the all-day lanes.
            .child(
                div()
                    .absolute()
                    .top_0()
                    .left_0()
                    .right_0()
                    .h(px(header_height))
                    .overflow_hidden()
                    .bg(palette.background)
                    .border_b_1()
                    .border_color(palette.border)
                    .children(header)
                    .child(
                        div()
                            .absolute()
                            .top_0()
                            .left_0()
                            .w(px(GUTTER_WIDTH))
                            .h_full()
                            .bg(palette.background)
                            .border_r_1()
                            .border_color(palette.border),
                    ),
            )
    }
}

fn line(top: f32, color: Hsla) -> AnyElement {
    div()
        .absolute()
        .top(px(top))
        .left(px(GUTTER_WIDTH))
        .right_0()
        .h(px(1.))
        .bg(color)
        .into_any_element()
}

fn day_header(frame: &Frame, date: NaiveDate, left: f32) -> impl IntoElement + use<> {
    let palette = frame.palette;
    let theme = &frame.theme;
    let today = date == frame.today;
    h_flex()
        .id(("week-day-header", epoch_day(date) as u64))
        .absolute()
        .top_0()
        .left(px(left))
        .w(px(frame.day_width))
        .h(px(HEADER_HEIGHT))
        .items_end()
        .justify_end()
        .gap_1()
        .pt_0p5()
        .pr_0p5()
        .pb(px(1.))
        .border_r_1()
        .border_color(palette.border)
        .font_family(frame.numerical.clone())
        .when_some(frame.day_background(date), |this, bg| this.bg(bg))
        .when(date == frame.active_date, |this| {
            this.text_color(palette.selected_text)
        })
        .on_click(move |_, _, cx| Navigation::navigate_to(date, None, cx))
        .child(
            div()
                .pb(px(8.))
                .text_size(text_size(theme, "2xs"))
                .text_color(palette.muted)
                .child(format_weekday(date, DatePartStyle::Short).to_uppercase()),
        )
        .child(
            div()
                .size(px(28.))
                .flex()
                .items_center()
                .justify_center()
                .rounded(radius_circle(theme))
                .text_size(text_size(theme, "xs"))
                .font_weight(FontWeight::MEDIUM)
                .when(today, |this| {
                    this.bg(palette.today).text_color(palette.today_text)
                })
                .child(date.day().to_string()),
        )
}

fn toggle_event(
    event: &CalendarEvent,
) -> impl Fn(&gpui_kit::ClickEvent, &mut Window, &mut App) + use<> {
    let key = event.key();
    move |_, _, cx| {
        cx.stop_propagation();
        let key = key.clone();
        EventStore::global(cx).update(cx, |store, cx| store.toggle_active_event(key, cx));
    }
}

fn all_day_bar(
    frame: &Frame,
    event: &CalendarEvent,
    left: f32,
    right: f32,
    top: f32,
) -> AnyElement {
    let theme = &frame.theme;
    let paint = event_paint(event, &frame.calendars, theme);
    let highlighted = frame.is_highlighted(event);
    let rsvp = Rsvp::of(event, &frame.calendars);
    let faded = Rsvp::is_faded(rsvp);
    // The bar sits inset 2px left, 3px right, 1px above and below.
    let bar_left = left + 2.0;
    let bar_width = (right - left - 5.0).max(0.0);
    // Like a sticky title: keep it in view when the bar starts off-screen.
    let title_offset = (GUTTER_WIDTH + 4.0 - bar_left).clamp(0.0, (bar_width - 24.0).max(0.0));
    div()
        .id(ElementId::Name(
            format!("week-bar:{}", event.key().0).into(),
        ))
        .absolute()
        .left(px(bar_left))
        .top(px(top + 1.0))
        .w(px(bar_width))
        .h(px(LANE_HEIGHT - 2.0))
        .flex()
        .items_center()
        .overflow_hidden()
        .px(metric(theme, "event.padding_x"))
        .rounded(radius(theme, 0.4))
        .text_size(text_size(theme, "xs"))
        .map(|this| {
            if faded {
                this.border_1()
                    .border_dashed()
                    .border_color(paint.color)
                    .text_color(paint.declined_text)
                    .opacity(0.5)
            } else {
                this.bg(if highlighted {
                    paint.selected_fill
                } else {
                    paint.fill
                })
                .text_color(paint.text)
            }
        })
        .when(rsvp == Some(Rsvp::Declined), |this| this.line_through())
        .on_click(toggle_event(event))
        .child(
            div()
                .min_w_0()
                .pl(px(title_offset))
                .truncate()
                .child(event_title(&event.summary, frame.palette.muted)),
        )
        .into_any_element()
}

fn timed_block(
    frame: &Frame,
    event: &CalendarEvent,
    placement: &TimedPlacement,
    left: f32,
) -> AnyElement {
    let theme = &frame.theme;
    let paint = event_paint(event, &frame.calendars, theme);
    let highlighted = frame.is_highlighted(event);
    let rsvp = Rsvp::of(event, &frame.calendars);
    let dashed = Rsvp::is_faded(rsvp);
    let pad = f32::from(metric(theme, "event.padding_x"));

    // The top covers the start hour's grid line; the bottom stops short of
    // the end hour's.
    let top = placement.top() * GRID_HEIGHT - 1.0;
    let height = (placement.height() * GRID_HEIGHT - 3.0).max(16.0);
    let indent = placement.column as f32 * CASCADE_OFFSET * frame.day_width;
    let width = (frame.day_width - indent - BLOCK_RIGHT_GAP).max(8.0);

    let start = format_time(&event.start, frame.time_format, frame.viewer);
    let end = format_time(&event.end, frame.time_format, frame.viewer);
    let text_color = if dashed {
        paint.declined_text
    } else {
        paint.text
    };
    let secondary = text_color.opacity(0.7);
    let title = || {
        div()
            .min_w_0()
            .font_weight(FontWeight::MEDIUM)
            .line_height(gpui_kit::relative(1.25))
            .child(event_title(&event.summary, frame.palette.muted))
    };
    let time = |text: String| {
        div()
            .min_w_0()
            .truncate()
            .line_height(gpui_kit::relative(1.25))
            .text_color(secondary)
            .child(text)
    };
    let content = match placement.display_mode {
        DisplayMode::Xs => h_flex()
            .items_baseline()
            .gap_1()
            .pt(px(1.))
            .child(title().flex_1().truncate())
            .child(
                time(start)
                    .flex_shrink_0()
                    .text_size(text_size(theme, "2xs")),
            )
            .into_any_element(),
        DisplayMode::Sm => div()
            .pt_0p5()
            .child(title().truncate())
            .child(time(format!("{start} - {end}")))
            .into_any_element(),
        DisplayMode::Md => div()
            .py_1()
            .child(title())
            .child(time(format!("{start} – {end}")))
            .into_any_element(),
        DisplayMode::Lg => div()
            .py_1()
            .child(title().line_clamp(2))
            .child(time(format!("{start} – {end}")))
            .into_any_element(),
    };

    div()
        .id(ElementId::Name(
            format!("week-event:{}", event.key().0).into(),
        ))
        .absolute()
        .top(px(top))
        .left(px(left + indent))
        .w(px(width))
        .h(px(height))
        .overflow_hidden()
        .rounded(radius(theme, 0.6))
        .px(px(pad))
        .when(!dashed, |this| this.pl(px(pad + 4.0)))
        .text_size(text_size(theme, "xs"))
        .text_color(text_color)
        // A ring rather than a border keeps the fill flush with the grid lines.
        .shadow(vec![BoxShadow {
            color: frame.palette.background,
            offset: point(px(0.), px(0.)),
            blur_radius: px(0.),
            spread_radius: px(1.),
            inset: false,
        }])
        .map(|this| {
            if dashed {
                this.bg(frame.palette.background)
                    .border_1()
                    .border_dashed()
                    .border_color(paint.color)
                    .opacity(0.5)
            } else {
                this.bg(if highlighted {
                    paint.selected_fill
                } else {
                    paint.fill
                })
            }
        })
        .when(rsvp == Some(Rsvp::Declined), |this| this.line_through())
        .on_click(toggle_event(event))
        .when(!dashed, |this| {
            this.child(
                div()
                    .absolute()
                    .left_0()
                    .top_0()
                    .bottom_0()
                    .w(px(4.))
                    .bg(paint.color),
            )
        })
        .child(content)
        .into_any_element()
}

/// A 1px dashed line, as separate quads: GPUI can't paint a border on a quad
/// no taller than the border.
fn dashes(width: f32, color: Hsla) -> gpui_kit::Div {
    const DASH: f32 = 3.0;
    const GAP: f32 = 3.0;
    let count = (width.max(0.0) / (DASH + GAP)).ceil() as usize;
    h_flex()
        .flex_1()
        .h(px(1.))
        .gap(px(GAP))
        .overflow_hidden()
        .children((0..count).map(move |_| div().flex_shrink_0().w(px(DASH)).h(px(1.)).bg(color)))
}

fn current_time(frame: &Frame, left: f32) -> AnyElement {
    let theme = &frame.theme;
    let top = frame.now_minutes / (24.0 * 60.0) * GRID_HEIGHT;
    let now = frame.now_minutes as u32;
    let label = format_wallclock_time(now / 60, now % 60, frame.time_format);
    h_flex()
        .absolute()
        .top(px(top - 6.0))
        .left(px(left - 14.0))
        .w(px(frame.day_width + 14.0 + 4.0))
        .h(px(12.))
        .items_center()
        .child(
            div()
                .flex_shrink_0()
                .text_size(text_size(theme, "2xs"))
                .font_weight(FontWeight::MEDIUM)
                .line_height(px(12.))
                .text_color(frame.palette.today)
                .child(label),
        )
        .child(dashes(frame.day_width + 4.0 - 40.0, frame.palette.today).ml_1())
        .into_any_element()
}
