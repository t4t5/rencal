//! The sidebar's month calendar (port of `sidebar/minical/`): the active
//! date's month as six fixed weeks with event dots, the selected week shaded,
//! and month arrows. Clicking a day jumps to it.

use std::collections::HashMap;

use chrono::{Datelike, Duration as Days, Months, NaiveDate};
use gpui_kit::component::button::{Button, ButtonVariants};
use gpui_kit::component::{Icon, Sizable, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    Context, FontWeight, Hsla, InteractiveElement, IntoElement, ParentElement, Render,
    StatefulInteractiveElement, Styled, Subscription, Window, div, px,
};
use rencal_time::display::{DatePartStyle, format_month};
use rencal_time::{CalendarEvent, FirstDayOfWeek, epoch_day, iso_week_number, start_of_week};

use crate::assets::RenIcon;
use crate::clock::Clock;
use crate::event_store::EventStore;
use crate::navigation::Navigation;
use crate::settings::Settings;
use crate::theme::ThemeStore;
use crate::ui::anchors::{Named, named_anchor};
use crate::ui::event_paint::calendar_accent;
use crate::ui::{Palette, Role, metric, radius_circle, text_size};

const WEEKS: usize = 6;
const CELL: f32 = 38.0;
const WEEK_NUMBER_WIDTH: f32 = 32.0;
const WEEKDAY_SHORT: [&str; 7] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

pub struct Minical {
    dots: HashMap<i32, Vec<Hsla>>,
    dots_key: Option<(u64, NaiveDate, u64)>,
    _subscriptions: Vec<Subscription>,
}

/// The first day of the six-week grid showing `month`'s month.
pub fn grid_start(month: NaiveDate, first_day: FirstDayOfWeek) -> NaiveDate {
    start_of_week(month.with_day(1).expect("the 1st exists"), first_day)
}

/// One dot colour per calendar with events on each day of the grid.
fn event_dots(
    events: &[CalendarEvent],
    colors: &HashMap<&str, Hsla>,
    first: i32,
    last: i32,
) -> HashMap<i32, Vec<Hsla>> {
    let mut slugs: HashMap<i32, Vec<&str>> = HashMap::new();
    let mut dots: HashMap<i32, Vec<Hsla>> = HashMap::new();
    for event in events {
        let Some(&color) = colors.get(event.calendar_slug.as_str()) else {
            continue;
        };
        let days = event.date_info.occupied_days();
        for day in (*days.start()).max(first)..=(*days.end()).min(last) {
            let seen = slugs.entry(day).or_default();
            if !seen.contains(&event.calendar_slug.as_str()) {
                seen.push(&event.calendar_slug);
                dots.entry(day).or_default().push(color);
            }
        }
    }
    dots
}

impl Minical {
    pub fn new(_: &mut Window, cx: &mut Context<Self>) -> Self {
        let store = EventStore::global(cx);
        Self {
            dots: HashMap::new(),
            dots_key: None,
            _subscriptions: vec![
                cx.observe(&store, |_, _, cx| cx.notify()),
                cx.observe_global::<Navigation>(|_, cx| cx.notify()),
                cx.observe_global::<Settings>(|_, cx| cx.notify()),
                cx.observe_global::<Clock>(|_, cx| cx.notify()),
                cx.observe_global::<ThemeStore>(|this, cx| {
                    this.dots_key = None;
                    cx.notify();
                }),
            ],
        }
    }
}

impl Render for Minical {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ThemeStore::active(cx);
        let palette = Palette::new(&theme);
        let settings = Settings::global(cx);
        let first_day = settings.first_day_of_week();
        let show_week_numbers = settings.rencal.show_week_numbers;
        let today = Clock::global(cx).today;
        let active = Navigation::active_date(cx);
        let start = grid_start(active, first_day);
        let first = epoch_day(start);
        let last = first + (WEEKS * 7) as i32 - 1;

        let store = EventStore::global(cx).read(cx);
        let key = (store.revision(), start, ptr_id(store.calendars()));
        if self.dots_key != Some(key) {
            let colors: HashMap<&str, Hsla> = store
                .calendars()
                .iter()
                .map(|calendar| {
                    let accent = theme
                        .optional_color("event.color")
                        .unwrap_or_else(|| calendar_accent(Some(calendar), &theme));
                    (calendar.slug.as_str(), crate::theme::hsla(accent))
                })
                .collect();
            self.dots = event_dots(store.events(), &colors, first, last);
            self.dots_key = Some(key);
        }

        let heading = Role::Heading;
        let weekday_order: Vec<usize> = match first_day {
            FirstDayOfWeek::Monday => vec![1, 2, 3, 4, 5, 6, 0],
            FirstDayOfWeek::Sunday => (0..7).collect(),
        };
        let current_weekday = today.weekday().num_days_from_sunday() as usize;
        let month_title = format_month(active, DatePartStyle::Long);

        let header = h_flex()
            .h_12()
            .px(metric(&theme, "layout.padding"))
            .pb_4()
            .items_center()
            .justify_between()
            .child(
                h_flex()
                    .min_w_0()
                    .overflow_hidden()
                    .gap_1p5()
                    .text_size(text_size(&theme, "2xl"))
                    .font_family(heading.family(cx))
                    .when_some(heading.weight(&theme), |this, weight| {
                        this.font_weight(weight)
                    })
                    .child(
                        div()
                            .font_weight(heading.weight(&theme).unwrap_or(FontWeight::BOLD))
                            .whitespace_nowrap()
                            .child(heading.text(&theme, month_title)),
                    )
                    .child(
                        div()
                            .font_weight(FontWeight::NORMAL)
                            .text_color(palette.brand)
                            .child(active.year().to_string()),
                    ),
            )
            .child(
                h_flex()
                    .gap_1()
                    .child(
                        Button::new("minical-previous")
                            .ghost()
                            .xsmall()
                            .icon(Icon::new(RenIcon::ChevronUp))
                            .on_click(move |_, _, cx| {
                                let date = Navigation::active_date(cx)
                                    .checked_sub_months(Months::new(1))
                                    .unwrap_or(active);
                                Navigation::navigate_to(date, None, cx);
                            }),
                    )
                    .child(
                        Button::new("minical-next")
                            .ghost()
                            .xsmall()
                            .icon(Icon::new(RenIcon::ChevronDown))
                            .on_click(move |_, _, cx| {
                                let date = Navigation::active_date(cx)
                                    .checked_add_months(Months::new(1))
                                    .unwrap_or(active);
                                Navigation::navigate_to(date, None, cx);
                            }),
                    ),
            );

        let weekdays = h_flex()
            .text_size(text_size(&theme, "2xs"))
            .text_color(palette.muted)
            .when(show_week_numbers, |this| {
                this.child(div().w(px(WEEK_NUMBER_WIDTH)).flex_shrink_0())
            })
            .children(weekday_order.iter().map(|&weekday| {
                let weekend = weekday == 0 || weekday == 6;
                div()
                    .flex_1()
                    .py_1()
                    .text_center()
                    .when(weekend, |this| this.bg(palette.weekend))
                    .when(weekday == current_weekday, |this| {
                        this.text_color(palette.today)
                    })
                    .child(WEEKDAY_SHORT[weekday])
            }));

        let weeks = (0..WEEKS).map(|week| {
            let days: Vec<NaiveDate> = (0..7)
                .map(|col| start + Days::days((week * 7 + col) as i64))
                .collect();
            let selected_week = days.contains(&active);
            h_flex()
                .when(show_week_numbers, |this| {
                    this.child(
                        div()
                            .w(px(WEEK_NUMBER_WIDTH))
                            .h(px(CELL))
                            .flex_shrink_0()
                            .flex()
                            .items_center()
                            .justify_center()
                            .text_size(text_size(&theme, "2xs"))
                            .text_color(palette.muted)
                            .when(selected_week, |this| this.bg(palette.hover))
                            .child(iso_week_number(days[0], first_day).to_string()),
                    )
                })
                .children(days.into_iter().map(|date| {
                    let weekend = date.weekday().number_from_monday() >= 6;
                    let is_today = date == today;
                    let selected = date == active;
                    let outside = date.month() != active.month();
                    let dots = self.dots.get(&epoch_day(date)).cloned().unwrap_or_default();
                    div()
                        .flex_1()
                        .h(px(CELL))
                        .flex()
                        .justify_center()
                        .when(weekend, |this| this.bg(palette.weekend))
                        .child(
                            div()
                                .size_full()
                                .flex()
                                .justify_center()
                                .when(selected_week, |this| this.bg(palette.hover))
                                .child(
                                    div()
                                        .id(("minical-day", epoch_day(date) as u64))
                                        .relative()
                                        .size(px(CELL))
                                        .flex()
                                        .items_center()
                                        .justify_center()
                                        .rounded(radius_circle(&theme))
                                        .text_size(text_size(&theme, "sm"))
                                        .when(outside, |this| this.text_color(palette.muted))
                                        .when(is_today, |this| this.text_color(palette.today))
                                        .map(|this| match (selected, is_today) {
                                            (true, true) => this
                                                .bg(palette.today)
                                                .text_color(palette.today_text)
                                                .font_weight(FontWeight::BOLD)
                                                .text_size(text_size(&theme, "lg")),
                                            (true, false) => this
                                                .bg(palette.selected)
                                                .text_color(palette.selected_text)
                                                .font_weight(FontWeight::BOLD)
                                                .text_size(text_size(&theme, "lg")),
                                            _ => this.hover(move |style| style.bg(palette.hover)),
                                        })
                                        .on_click(move |_, _, cx| {
                                            Navigation::navigate_to(date, None, cx)
                                        })
                                        .child(named_anchor(Named::MinicalDay(date)))
                                        .child(date.day().to_string())
                                        .when(!dots.is_empty(), |this| {
                                            this.child(
                                                h_flex()
                                                    .absolute()
                                                    .bottom_1()
                                                    .left_0()
                                                    .right_0()
                                                    .justify_center()
                                                    .gap(px(3.))
                                                    .children(dots.into_iter().map(|color| {
                                                        div()
                                                            .size(px(4.))
                                                            .rounded(radius_circle(&theme))
                                                            .bg(color)
                                                    })),
                                            )
                                        }),
                                ),
                        )
                }))
        });

        v_flex()
            .relative()
            .pt_4()
            .flex_shrink_0()
            .child(named_anchor(Named::Minical))
            .child(header)
            .child(weekdays)
            .children(weeks)
    }
}

/// Identity of the calendars list, so the dots recolour when it changes.
fn ptr_id<T>(arc: &std::sync::Arc<T>) -> u64 {
    std::sync::Arc::as_ptr(arc) as *const () as usize as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grids_start_on_the_week_of_the_1st() {
        let date = |s: &str| s.parse::<NaiveDate>().unwrap();
        assert_eq!(
            grid_start(date("2026-10-17"), FirstDayOfWeek::Monday),
            date("2026-09-28")
        );
        assert_eq!(
            grid_start(date("2026-10-17"), FirstDayOfWeek::Sunday),
            date("2026-09-27")
        );
    }
}
