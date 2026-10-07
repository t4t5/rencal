//! The board view (port of `components/main/board-view/`): the loaded events
//! from yesterday to the end of this week, in four columns.

use std::sync::Arc;

use chrono::{Datelike, Duration as Days, NaiveDate};
use gpui_kit::component::{h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    AnyElement, Context, ElementId, FontWeight, InteractiveElement, IntoElement, ParentElement,
    Render, SharedString, StatefulInteractiveElement, Styled, Subscription, Window, div, px,
};
use rencal_theme::ResolvedTheme;
use rencal_time::display::{DatePartStyle, format_month, format_short_date, format_time};
use rencal_time::{Calendar, CalendarEvent, EventKey, TimeFormat, Tz, start_of_week};

use crate::clock::Clock;
use crate::editing::popover;
use crate::event_store::EventStore;
use crate::settings::Settings;
use crate::theme::ThemeStore;
use crate::ui::anchors::{Anchors, EventSource, event_anchor};
use crate::ui::event_paint::{Rsvp, event_paint};
use crate::ui::{Palette, Role, event_title, text_size};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Bucket {
    Yesterday,
    Today,
    Tomorrow,
    ThisWeek,
}

impl Bucket {
    const ALL: [Bucket; 4] = [Self::Yesterday, Self::Today, Self::Tomorrow, Self::ThisWeek];

    fn title(self) -> &'static str {
        match self {
            Self::Yesterday => "Yesterday",
            Self::Today => "Today",
            Self::Tomorrow => "Tomorrow",
            Self::ThisWeek => "This Week",
        }
    }
}

/// The column an event starting on `date` goes in; `None` outside the board.
pub fn bucket(date: NaiveDate, today: NaiveDate, end_of_week: NaiveDate) -> Option<Bucket> {
    let offset = (date - today).num_days();
    match offset {
        -1 => Some(Bucket::Yesterday),
        0 => Some(Bucket::Today),
        1 => Some(Bucket::Tomorrow),
        _ if offset > 1 && date <= end_of_week => Some(Bucket::ThisWeek),
        _ => None,
    }
}

/// The events of each column, in `Bucket::ALL` order. "This Week" is sorted
/// by day, then start; the others keep the loaded order.
pub fn columns(
    events: &[CalendarEvent],
    today: NaiveDate,
    end_of_week: NaiveDate,
    viewer: Tz,
) -> [Vec<usize>; 4] {
    let mut columns: [Vec<usize>; 4] = Default::default();
    for (index, event) in events.iter().enumerate() {
        let date = event.start.date_in_viewer_zone(viewer);
        if let Some(bucket) = bucket(date, today, end_of_week) {
            columns[bucket as usize].push(index);
        }
    }
    columns[Bucket::ThisWeek as usize].sort_by_key(|&index| {
        let info = &events[index].date_info;
        (info.first_day, info.start_ms)
    });
    columns
}

pub struct BoardView {
    requested: Option<(NaiveDate, NaiveDate)>,
    _subscriptions: Vec<Subscription>,
}

impl BoardView {
    pub fn new(_: &mut Window, cx: &mut Context<Self>) -> Self {
        let store = EventStore::global(cx);
        Self {
            requested: None,
            _subscriptions: vec![
                cx.observe(&store, |_, _, cx| cx.notify()),
                cx.observe_global::<Settings>(|_, cx| cx.notify()),
                cx.observe_global::<Clock>(|_, cx| cx.notify()),
            ],
        }
    }
}

struct Card {
    theme: Arc<ResolvedTheme>,
    palette: Palette,
    numerical: SharedString,
    calendars: Arc<Vec<Calendar>>,
    active: Option<EventKey>,
    viewer: Tz,
    today: NaiveDate,
    time_format: TimeFormat,
}

impl Render for BoardView {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ThemeStore::active(cx);
        let clock = *Clock::global(cx);
        let settings = Settings::global(cx);
        let (first_day, time_format) = (settings.first_day_of_week(), settings.time_format());
        let end_of_week = start_of_week(clock.today, first_day) + Days::days(6);
        let yesterday = clock.today - Days::days(1);
        // The board shows what's loaded; keep its days in the loaded range.
        let range = (yesterday, end_of_week + Days::days(1));
        if self.requested != Some(range) {
            self.requested = Some(range);
            cx.defer(move |cx| EventStore::ensure_loaded(range.0, range.1, cx));
        }

        let store = EventStore::global(cx).read(cx);
        let events = store.events().clone();
        let card = Card {
            palette: Palette::new(&theme),
            numerical: Role::Numerical.family(cx),
            calendars: store.calendars().clone(),
            active: store.active_event().cloned(),
            viewer: clock.viewer,
            today: clock.today,
            time_format,
            theme: theme.clone(),
        };
        let palette = card.palette;
        let columns = columns(&events, clock.today, end_of_week, clock.viewer);

        h_flex()
            .size_full()
            .overflow_hidden()
            .children(
                Bucket::ALL
                    .into_iter()
                    .zip(columns)
                    .map(|(bucket, indexes)| {
                        let is_today = bucket == Bucket::Today;
                        let count = indexes.len();
                        v_flex()
                            .flex_1()
                            .min_w_0()
                            .h_full()
                            .overflow_hidden()
                            .when(bucket != Bucket::ThisWeek, |this| {
                                this.border_r_1().border_color(palette.border)
                            })
                            .child(
                                h_flex()
                                    .flex_shrink_0()
                                    .justify_between()
                                    .items_center()
                                    .px_3()
                                    .py_2()
                                    .border_b_1()
                                    .border_color(palette.border)
                                    .font_family(card.numerical.clone())
                                    .text_size(text_size(&theme, "2xs"))
                                    .text_color(palette.muted)
                                    .when(is_today, |this| this.bg(palette.highlight))
                                    .child(
                                        div()
                                            .font_weight(FontWeight::MEDIUM)
                                            .child(bucket.title().to_uppercase()),
                                    )
                                    .child(if count > 0 {
                                        count.to_string()
                                    } else {
                                        String::new()
                                    }),
                            )
                            .child(
                                v_flex()
                                    .id(("board-column", bucket as usize))
                                    .flex_1()
                                    .min_h_0()
                                    .overflow_y_scroll()
                                    .children(indexes.iter().enumerate().map(
                                        |(position, &index)| {
                                            board_card(
                                                &card,
                                                &events[index],
                                                bucket == Bucket::ThisWeek,
                                                position + 1 == count,
                                            )
                                        },
                                    ))
                                    .when(count == 0, |this| {
                                        this.child(
                                            div()
                                                .py_8()
                                                .text_center()
                                                .text_size(text_size(&theme, "xs"))
                                                .text_color(palette.muted)
                                                .child("—"),
                                        )
                                    }),
                            )
                    }),
            )
    }
}

/// "Oct 7," — a day in a multi-day time range.
fn range_date(date: NaiveDate) -> String {
    format!(
        "{} {},",
        format_month(date, DatePartStyle::Short),
        date.day()
    )
}

fn board_card(card: &Card, event: &CalendarEvent, show_date: bool, last: bool) -> AnyElement {
    let theme = &card.theme;
    let palette = card.palette;
    let paint = event_paint(event, &card.calendars, theme);
    let key = event.key();
    let highlighted = card.active.as_ref() == Some(&key);
    let rsvp = Rsvp::of(event, &card.calendars);
    let all_day = event.start.is_all_day();
    let start_date = event.start.date_in_viewer_zone(card.viewer);
    let time = |time| format_time(time, card.time_format, card.viewer);
    let time_label = if all_day {
        "All day".to_owned()
    } else if event.start.is_same_day(&event.end, card.viewer) {
        format!("{} - {}", time(&event.start), time(&event.end))
    } else {
        let end_date = event.end.date_in_viewer_zone(card.viewer);
        format!(
            "{} {} - {} {}",
            range_date(start_date),
            time(&event.start),
            range_date(end_date),
            time(&event.end)
        )
    };
    let muted_line = |text: String| {
        div()
            .h_4()
            .text_size(text_size(theme, "xs"))
            .text_color(palette.muted)
            .child(text)
    };

    div()
        .id(ElementId::Name(format!("board:{}", key.0).into()))
        .relative()
        .py_1p5()
        .when(!last, |this| this.border_b_1().border_color(palette.border))
        .map(|this| {
            if highlighted {
                this.bg(palette.selected).text_color(palette.selected_text)
            } else {
                this.hover(move |style| style.bg(palette.hover))
            }
        })
        .when(Rsvp::is_faded(rsvp), |this| this.opacity(0.5))
        .when(rsvp == Some(Rsvp::Declined), |this| this.line_through())
        .child(event_anchor(key.clone(), EventSource::View))
        .on_click(move |e, _, cx| {
            let anchor = Anchors::event_bounds(&key, Some(e.position()), cx);
            popover::toggle_event(key.clone(), anchor, cx);
        })
        .child(
            h_flex()
                .gap_3()
                .pl_3()
                .pr_2()
                .child(
                    div()
                        .w(px(3.))
                        .flex_shrink_0()
                        .self_stretch()
                        .bg(paint.color),
                )
                .child(
                    v_flex()
                        .min_w_0()
                        .when(show_date, |this| {
                            this.child(
                                muted_line(format_short_date(start_date, card.today))
                                    .font_family(card.numerical.clone()),
                            )
                        })
                        .child(
                            div()
                                .truncate()
                                .text_size(text_size(theme, "sm"))
                                .font_weight(FontWeight::MEDIUM)
                                .child(event_title(&event.summary, palette.muted)),
                        )
                        .child(
                            muted_line(time_label)
                                .when(!all_day, |this| this.font_family(card.numerical.clone())),
                        )
                        .when_some(event.location.clone(), |this, location| {
                            this.child(muted_line(location).h_auto().truncate())
                        }),
                ),
        )
        .into_any_element()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buckets_from_yesterday_to_the_end_of_the_week() {
        let date = |s: &str| s.parse::<NaiveDate>().unwrap();
        let today = date("2026-10-07");
        let end = date("2026-10-11");
        assert_eq!(bucket(date("2026-10-05"), today, end), None);
        assert_eq!(
            bucket(date("2026-10-06"), today, end),
            Some(Bucket::Yesterday)
        );
        assert_eq!(bucket(today, today, end), Some(Bucket::Today));
        assert_eq!(
            bucket(date("2026-10-08"), today, end),
            Some(Bucket::Tomorrow)
        );
        assert_eq!(
            bucket(date("2026-10-09"), today, end),
            Some(Bucket::ThisWeek)
        );
        assert_eq!(bucket(end, today, end), Some(Bucket::ThisWeek));
        assert_eq!(bucket(date("2026-10-12"), today, end), None);
    }
}
