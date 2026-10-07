//! The search palette (port of `toolbar/search/SearchPalette.tsx`): event
//! titles across the visible calendars, nearest to now first. Choosing a
//! result jumps to its date and opens it (`useJumpToEvent`).

use std::time::Duration;

use chrono::Utc;
use gpui_kit::component::command::{Command, CommandItem, CommandState};
use gpui_kit::component::{IndexPath, WindowExt, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    App, AppContext, Context, Entity, FocusHandle, FontWeight, IntoElement, ParentElement, Render,
    SharedString, Styled, Task, Window, div, px,
};
use rencal_text::search::prepare_search_results;
use rencal_time::CalendarEvent;
use rencal_time::display::{format_short_date, format_time};

use crate::backend::{self, Backend};
use crate::clock::Clock;
use crate::event_store::EventStore;
use crate::navigation::{Navigation, ScrollBehavior};
use crate::settings::Settings;
use crate::theme::ActiveRenTheme;
use crate::ui::event_paint::{Rsvp, event_paint};
use crate::ui::{color, text_size};

const DEBOUNCE: Duration = Duration::from_millis(300);
const MIN_QUERY: usize = 2;

pub fn open(window: &mut Window, cx: &mut App) {
    let restore = window.focused(cx);
    let search = cx.new(|cx| SearchPalette::new(restore, window, cx));
    window.open_dialog(cx, {
        let search = search.clone();
        move |dialog, _, _| {
            dialog
                .w(px(672.))
                .margin_top(px(20.))
                .close_button(false)
                .p_0()
                .child(search.clone())
        }
    });
    let state = search.read(cx).state.clone();
    state.update(cx, |state, cx| state.focus(window, cx));
}

pub struct SearchPalette {
    state: Entity<CommandState>,
    query: String,
    results: Vec<CalendarEvent>,
    loading: bool,
    request: Option<Task<()>>,
    restore: Option<FocusHandle>,
}

impl SearchPalette {
    fn new(restore: Option<FocusHandle>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        Self {
            state: cx.new(|cx| CommandState::new(window, cx)),
            query: String::new(),
            results: Vec::new(),
            loading: false,
            request: None,
            restore,
        }
    }

    fn query_changed(&mut self, query: &str, cx: &mut Context<Self>) {
        self.query = query.to_owned();
        self.results.clear();
        let slugs = EventStore::global(cx).read(cx).visible_calendars().to_vec();
        if query.chars().count() < MIN_QUERY || slugs.is_empty() {
            self.loading = false;
            self.request = None;
            cx.notify();
            return;
        }
        self.loading = true;
        let query = query.to_owned();
        // Replacing the task cancels the previous search.
        self.request = Some(cx.spawn(async move |this, cx| {
            cx.background_executor().timer(DEBOUNCE).await;
            let read = cx.update(|cx| {
                let viewer = Clock::global(cx).viewer;
                Backend::read(cx, move |state| {
                    rencal_core::caldir::search_events(state, slugs, query)
                        .map(|found| backend::app_events(&found, viewer))
                })
            });
            let results = match read {
                Some(read) => match read.await {
                    Ok(Ok(found)) => found,
                    Ok(Err(err)) => {
                        log::error!("event search failed: {err}");
                        Vec::new()
                    }
                    Err(err) => {
                        log::error!("event search failed: {err}");
                        Vec::new()
                    }
                },
                None => Vec::new(),
            };
            this.update(cx, |this, cx| {
                let viewer = Clock::global(cx).viewer;
                this.results = prepare_search_results(results, Utc::now(), viewer);
                this.loading = false;
                cx.notify();
            })
            .ok();
        }));
        cx.notify();
    }

    fn confirm(&mut self, index: usize, window: &mut Window, cx: &mut Context<Self>) {
        let Some(event) = self.results.get(index).cloned() else {
            return;
        };
        window.close_dialog(cx);
        if let Some(focus) = self.restore.clone() {
            window.focus(&focus, cx);
        }
        jump_to_event(event, cx);
    }
}

/// How long a jump waits for the target date's events to load.
const JUMP_LOAD_TIMEOUT: Duration = Duration::from_secs(5);

/// Goes to `event`'s date and opens it: the occurrence on that date for a
/// recurring master (search returns masters). A far date's events load
/// first; the result itself is added only if its occurrence never shows up.
pub fn jump_to_event(event: CalendarEvent, cx: &mut App) {
    let viewer = Clock::global(cx).viewer;
    let date = event.start.date_in_viewer_zone(viewer);
    Navigation::navigate_to(date, Some(ScrollBehavior::Instant), cx);
    cx.spawn(async move |cx| {
        let started = std::time::Instant::now();
        loop {
            let loaded = cx.update(|cx| {
                let store = EventStore::global(cx);
                let store = store.read(cx);
                store.covers(date) && !store.is_fetching()
            });
            if loaded || started.elapsed() > JUMP_LOAD_TIMEOUT {
                break;
            }
            cx.background_executor()
                .timer(Duration::from_millis(20))
                .await;
        }
        cx.update(|cx| open_occurrence(event, date, cx));
    })
    .detach();
}

fn open_occurrence(event: CalendarEvent, date: chrono::NaiveDate, cx: &mut App) {
    let day = rencal_time::epoch_day(date);
    let master = event.key();
    let occurrence_prefix = format!("{}__", master.0);
    let recurring = event.recurrence.is_some();
    EventStore::global(cx).update(cx, |store, cx| {
        let occurrence = store
            .events()
            .iter()
            .find(|e| {
                e.date_info.occupied_days().contains(&day)
                    && (e.key() == master
                        || (recurring && e.key().0.starts_with(&occurrence_prefix)))
            })
            .map(CalendarEvent::key);
        let key = match occurrence {
            Some(key) => key,
            None => {
                store.add_event_if_missing(event, cx);
                master
            }
        };
        store.set_active_event(Some(key), cx);
    });
}

impl Render for SearchPalette {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let loading = self.loading;
        self.state.update(cx, |state, cx| {
            if state.is_loading() != loading {
                state.set_loading(loading, window, cx);
            }
        });
        let theme = cx.ren_theme();
        let muted = color(theme, "text.muted");
        let size_sm = text_size(theme, "sm");
        let size_xs = text_size(theme, "xs");
        let clock = *Clock::global(cx);
        let time_format = Settings::global(cx).time_format();
        let store = EventStore::global(cx).read(cx);
        let calendars = store.calendars().clone();
        let show_list = self.query.chars().count() >= MIN_QUERY;

        let items = self.results.iter().map(|event| {
            let paint = event_paint(event, &calendars, theme);
            let rsvp = Rsvp::of(event, &calendars);
            let date =
                format_short_date(event.start.date_in_viewer_zone(clock.viewer), clock.today);
            let when = if event.start.is_all_day() {
                date
            } else {
                format!(
                    "{date} · {}",
                    format_time(&event.start, time_format, clock.viewer)
                )
            };
            let title: SharedString = event.summary.clone().into();
            CommandItem::new().label(title.clone()).child(move |_, _| {
                h_flex()
                    .min_w_0()
                    .items_center()
                    .gap_2()
                    .when(Rsvp::is_faded(rsvp), |this| this.opacity(0.5))
                    .when(rsvp == Some(Rsvp::Declined), |this| this.line_through())
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
                            .child(
                                div()
                                    .truncate()
                                    .text_size(size_sm)
                                    .font_weight(FontWeight::MEDIUM)
                                    .child(title.clone()),
                            )
                            .child(
                                div()
                                    .text_size(size_xs)
                                    .text_color(muted)
                                    .child(when.clone()),
                            ),
                    )
            })
        });
        let this = cx.entity().downgrade();
        let confirm = this.clone();
        let busy = loading;

        div().child(
            Command::new(&self.state)
                .bordered(false)
                .filterable(false)
                .placeholder("Search your events...")
                .max_h(px(400.))
                .when(show_list, |command| command.items(items))
                .on_query(move |text, _, cx| {
                    this.update(cx, |search, cx| search.query_changed(text, cx))
                        .ok();
                })
                .on_confirm(move |path: IndexPath, window, cx| {
                    confirm
                        .update(cx, |search, cx| search.confirm(path.row, window, cx))
                        .ok();
                })
                .empty(move |state, _, cx| {
                    let query_len = state.query(cx).chars().count();
                    div()
                        .px_3()
                        .py_6()
                        .text_center()
                        .text_color(muted)
                        .when(query_len >= MIN_QUERY && !busy, |this| {
                            this.child("No events found.")
                        })
                }),
        )
    }
}

#[cfg(test)]
mod tests {
    use gpui_kit::TestAppContext;
    use rencal_config::ThemeConfig;
    use rencal_time::event::{DateRange, Recurrence};

    use super::*;
    use crate::event_store::test_events::timed;
    use crate::test_support;

    #[gpui_kit::test]
    fn jumping_to_a_recurring_result_opens_its_occurrence(cx: &mut TestAppContext) {
        let utc = chrono_tz::UTC;
        let date = |s: &str| s.parse::<chrono::NaiveDate>().unwrap();
        let mut occurrence = timed(
            "standup__20261020T090000Z",
            "Standup",
            "2026-10-20 09:00",
            "2026-10-20 09:15",
            utc,
        );
        occurrence.recurring_event_id = Some("standup".into());
        let mut master = timed(
            "standup",
            "Standup",
            "2026-10-20 09:00",
            "2026-10-20 09:15",
            utc,
        );
        master.recurrence = Some(Recurrence {
            rrule: "FREQ=DAILY".into(),
            exdates: Vec::new(),
            rdates: Vec::new(),
        });
        cx.update(|cx| {
            test_support::init(ThemeConfig::default(), None, cx);
            EventStore::global(cx).update(cx, |store, cx| {
                store.set_test_events(
                    vec![occurrence],
                    DateRange {
                        start: date("2026-10-01"),
                        end: date("2026-11-01"),
                    },
                    cx,
                )
            });
            jump_to_event(master, cx);
        });
        cx.run_until_parked();
        cx.update(|cx| {
            assert_eq!(Navigation::active_date(cx), date("2026-10-20"));
            let store = EventStore::global(cx);
            let store = store.read(cx);
            assert_eq!(
                store.active_event().map(|k| k.0.as_str()),
                Some("work::standup__20261020T090000Z")
            );
            // The occurrence was found, so the master wasn't added.
            assert_eq!(store.events().len(), 1);
        });
    }
}
