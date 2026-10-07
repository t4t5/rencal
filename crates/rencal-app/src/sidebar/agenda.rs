//! The agenda (port of `sidebar/agenda/`): the loaded events as day sections
//! in a GPUI `list`, keyed by epoch day.
//!
//! - It opens at the active date and follows it: a jump scrolls its section
//!   to the top, adding an empty "ghost" section for a date without events
//!   that goes away once scrolled out of view.
//! - Scrolling (by the user) makes the section at the top the active date,
//!   unless a jump is settling or an agenda row has keyboard focus.
//! - Reaching either end loads two more months. Sections are rebuilt when the
//!   events change, keeping the same day at the top.
//! - `Tab` / `Shift-Tab` move a keyboard selection through the rows (the old
//!   DOM focus), which sets the active date to the row's day.

use std::collections::BTreeMap;
use std::ops::Range;
use std::rc::Rc;
use std::sync::Arc;

use chrono::NaiveDate;
use gpui_kit::component::button::{Button, ButtonRounded, ButtonVariants};
use gpui_kit::component::{Icon, Sizable, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    AnyElement, App, Bounds, Context, ElementId, FontWeight, InteractiveElement, IntoElement,
    ListAlignment, ListOffset, ListState, ParentElement, Pixels, Render, SharedString,
    StatefulInteractiveElement, Styled, Subscription, WeakEntity, Window, div, list, px,
};
use rencal_text::conference::{EventLinks, is_within_join_window};
use rencal_theme::ResolvedTheme;
use rencal_time::day::add_months_to_month_start;
use rencal_time::display::{format_day_month, format_time, relative_day_label};
use rencal_time::{
    Calendar, CalendarEvent, EventKey, TimeFormat, Tz, date_from_epoch_day, epoch_day,
};

use crate::accounts::connect::{self, ConnectStep};
use crate::assets::RenIcon;
use crate::clock::Clock;
use crate::editing::draft::{DRAFT_ID, DraftState};
use crate::editing::popover;
use crate::event_store::EventStore;
use crate::navigation::Navigation;
use crate::settings::Settings;
use crate::theme::ThemeStore;
use crate::ui::anchors::{Anchors, EventSource, event_anchor};
use crate::ui::event_paint::{EventPaint, Rsvp, event_paint};
use crate::ui::{Palette, Role, event_title, line_height, metric, radius, text_size};
use crate::ui_state::UiState;
use crate::views::{ViewEvents, measure};

/// The day header's height (`h-8`).
const DATE_BAR_HEIGHT: f32 = 32.0;
/// The top share of the viewport whose section becomes the active date.
const ACTIVE_ZONE: f32 = 0.1;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Section {
    pub day: i32,
    /// Events covering the whole day (all-day, or the middle of a multi-day
    /// span): shown as chips.
    pub all_day: Vec<usize>,
    pub timed: Vec<usize>,
    pub ghost: bool,
}

impl Section {
    fn items(&self) -> impl Iterator<Item = (usize, bool)> + '_ {
        self.all_day
            .iter()
            .map(|&i| (i, true))
            .chain(self.timed.iter().map(|&i| (i, false)))
    }
}

/// Day sections for `events`, in day order, plus an empty one for `ghost`
/// when that day has no events.
pub fn build_sections(events: &[CalendarEvent], ghost: Option<i32>) -> Vec<Section> {
    let mut days: BTreeMap<i32, Vec<usize>> = BTreeMap::new();
    for (index, event) in events.iter().enumerate() {
        for day in event.date_info.occupied_days() {
            days.entry(day).or_default().push(index);
        }
    }
    if let Some(day) = ghost {
        days.entry(day).or_default();
    }
    days.into_iter()
        .map(|(day, mut indexes)| {
            indexes.sort_by_key(|&i| events[i].date_info.start_ms);
            let (all_day, timed): (Vec<usize>, Vec<usize>) = indexes
                .into_iter()
                .partition(|&i| events[i].date_info.covers_full_day(&events[i].start, day));
            let ghost = ghost == Some(day) && all_day.is_empty() && timed.is_empty();
            Section {
                day,
                all_day,
                timed,
                ghost,
            }
        })
        .collect()
}

/// The time line of a timed row on `day`: a range for same-day events, else
/// the boundary the day touches.
pub fn time_label(event: &CalendarEvent, day: i32, format: TimeFormat, viewer: Tz) -> String {
    let start = format_time(&event.start, format, viewer);
    if event.start.is_same_day(&event.end, viewer) {
        return format!("{start} - {}", format_time(&event.end, format, viewer));
    }
    if event.start.day(viewer) == day {
        format!("Starts at {start}")
    } else {
        format!("Ends at {}", format_time(&event.end, format, viewer))
    }
}

struct Data {
    events: Arc<Vec<CalendarEvent>>,
    sections: Vec<Section>,
}

struct Ghost {
    day: i32,
    seen: bool,
}

pub struct Agenda {
    list: ListState,
    data: Rc<Data>,
    /// What `data` was built from: events (and draft) revision and ghost day.
    built: Option<((u64, u64, u64), Option<i32>)>,
    ghost: Option<Ghost>,
    initial_scrolled: bool,
    nav_version: u64,
    /// A regroup (calendar group or time zone change) keeps this date at the
    /// top once the new events arrive.
    pending_regroup: Option<(NaiveDate, u64)>,
    /// The keyboard-selected row: its section's day and event.
    focused: Option<(i32, EventKey)>,
    bounds: Bounds<Pixels>,
    active_group: String,
    viewer: Tz,
    _subscriptions: Vec<Subscription>,
}

impl Agenda {
    pub fn new(_: &mut Window, cx: &mut Context<Self>) -> Self {
        let list = ListState::new(0, ListAlignment::Top, px(400.));
        let this = cx.entity().downgrade();
        // GPUI calls this while the list state is borrowed, and `scrolled`
        // reads the list: run it after.
        list.set_scroll_handler(move |event, _, cx| {
            let (this, visible, count) = (this.clone(), event.visible_range.clone(), event.count);
            cx.defer(move |cx| {
                this.update(cx, |agenda, cx| agenda.scrolled(visible, count, cx))
                    .ok();
            });
        });
        let store = EventStore::global(cx);
        let draft = DraftState::global(cx);
        let subscriptions = vec![
            cx.observe(&draft, |_, _, cx| cx.notify()),
            cx.observe(&store, |this, store, cx| {
                if this.focused.is_some() && store.read(cx).selected_event().is_none() {
                    this.focused = None;
                }
                cx.notify();
            }),
            cx.observe_global::<Navigation>(|this, cx| this.navigated(cx)),
            cx.observe_global::<Settings>(|_, cx| cx.notify()),
            cx.observe_global::<UiState>(|this, cx| {
                let group = UiState::global(cx).active_group.clone();
                if group != this.active_group {
                    this.active_group = group;
                    this.begin_regroup(cx);
                }
            }),
            cx.observe_global::<Clock>(|this, cx| {
                let viewer = Clock::global(cx).viewer;
                if viewer != this.viewer {
                    this.viewer = viewer;
                    this.begin_regroup(cx);
                }
                cx.notify();
            }),
        ];
        Self {
            list,
            data: Rc::new(Data {
                events: Arc::default(),
                sections: Vec::new(),
            }),
            built: None,
            ghost: None,
            initial_scrolled: false,
            nav_version: Navigation::global(cx).version,
            pending_regroup: None,
            focused: None,
            bounds: Bounds::default(),
            active_group: UiState::global(cx).active_group.clone(),
            viewer: Clock::global(cx).viewer,
            _subscriptions: subscriptions,
        }
    }

    fn set_bounds(&mut self, bounds: Bounds<Pixels>) -> bool {
        let changed = bounds != self.bounds;
        self.bounds = bounds;
        changed
    }

    fn begin_regroup(&mut self, cx: &mut Context<Self>) {
        let revision = EventStore::global(cx).read(cx).revision();
        self.pending_regroup = Some((Navigation::active_date(cx), revision));
        Navigation::set_navigating(true, cx);
    }

    fn navigated(&mut self, cx: &mut Context<Self>) {
        let nav = Navigation::global(cx).clone();
        if nav.version != self.nav_version {
            self.nav_version = nav.version;
            // A jump takes the selection away from the agenda, like a blur.
            if self.focused.take().is_some() {
                EventStore::global(cx).update(cx, |store, cx| store.set_selected_event(None, cx));
            }
            self.scroll_to_date(nav.active_date);
        }
        cx.notify();
    }

    /// Scrolls `date`'s section to the top, or shows a ghost section for it.
    fn scroll_to_date(&mut self, date: NaiveDate) {
        let day = epoch_day(date);
        let has_events = self
            .data
            .sections
            .iter()
            .any(|section| section.day == day && !section.ghost);
        self.ghost = (!has_events).then_some(Ghost { day, seen: false });
        self.rebuild();
        if let Some(index) = self.data.sections.iter().position(|s| s.day == day) {
            self.list.scroll_to(ListOffset {
                item_ix: index,
                offset_in_item: px(0.),
            });
        }
    }

    /// Rebuilds the sections from the current data, keeping the day at the top.
    fn rebuild(&mut self) {
        let events = self.data.events.clone();
        self.rebuild_with(events, self.built.map_or((0, 0, 0), |b| b.0));
    }

    fn rebuild_with(&mut self, events: Arc<Vec<CalendarEvent>>, revision: (u64, u64, u64)) {
        let ghost = self.ghost.as_ref().map(|g| g.day);
        if self.built == Some((revision, ghost)) && Arc::ptr_eq(&events, &self.data.events) {
            return;
        }
        let anchor = self.anchor();
        let sections = build_sections(&events, ghost);
        self.list.reset(sections.len());
        if let Some((day, offset)) = anchor {
            let exact = sections.iter().position(|s| s.day == day);
            let index = exact
                .or_else(|| sections.iter().position(|s| s.day > day))
                .unwrap_or(sections.len().saturating_sub(1));
            self.list.scroll_to(ListOffset {
                item_ix: index,
                offset_in_item: if exact.is_some() { offset } else { px(0.) },
            });
        }
        self.data = Rc::new(Data { events, sections });
        self.built = Some((revision, ghost));
    }

    /// The day at the top of the list and how far into its section.
    fn anchor(&self) -> Option<(i32, Pixels)> {
        let top = self.list.logical_scroll_top();
        let section = self.data.sections.get(top.item_ix)?;
        Some((section.day, top.offset_in_item))
    }

    fn scrolled(&mut self, visible: Range<usize>, count: usize, cx: &mut Context<Self>) {
        let sections = &self.data.sections;
        if let Some(ghost) = &mut self.ghost {
            let index = sections.iter().position(|s| s.day == ghost.day);
            if index.is_some_and(|i| visible.contains(&i)) {
                ghost.seen = true;
            } else if ghost.seen {
                self.ghost = None;
                cx.notify();
            }
        }

        // Near either end: load two more months, once the last load landed
        // (which moves the list away from the end it extended).
        let store = EventStore::global(cx);
        let store = store.read(cx);
        if let Some(range) = store.loaded_range().filter(|_| !store.is_fetching()) {
            if visible.start == 0 {
                let start = add_months_to_month_start(range.start, -2);
                cx.defer(move |cx| EventStore::ensure_loaded(start, range.end, cx));
            } else if visible.end + 1 >= count {
                let end = add_months_to_month_start(range.end, 2);
                cx.defer(move |cx| EventStore::ensure_loaded(range.start, end, cx));
            }
        }

        // The section in the top band becomes the active date.
        if Navigation::is_navigating(cx) || self.focused.is_some() || self.ghost.is_some() {
            return;
        }
        if let Some(day) = self.day_in_active_zone() {
            Navigation::set_active_date(date_from_epoch_day(day), cx);
        }
    }

    fn day_in_active_zone(&self) -> Option<i32> {
        let top = self.list.logical_scroll_top();
        let zone = self.bounds.top() + self.bounds.size.height * ACTIVE_ZONE;
        let mut index = top.item_ix;
        if let Some(bounds) = self.list.bounds_for_item(index)
            && bounds.bottom() < zone
        {
            index += 1;
        }
        self.data.sections.get(index).map(|s| s.day)
    }

    /// Every row in display order: (section day, event index, all-day).
    fn items(&self) -> Vec<(i32, usize, bool)> {
        self.data
            .sections
            .iter()
            .flat_map(|section| {
                section
                    .items()
                    .map(move |(index, all_day)| (section.day, index, all_day))
            })
            .collect()
    }

    /// Moves the keyboard selection by `delta` rows (`Tab` / `Shift-Tab`).
    /// Without one it starts at the active date's first timed row.
    pub fn focus_item(&mut self, delta: isize, cx: &mut Context<Self>) {
        let items = self.items();
        if items.is_empty() {
            return;
        }
        let events = &self.data.events;
        let current = self.focused.as_ref().and_then(|(day, key)| {
            items
                .iter()
                .position(|&(d, i, _)| d == *day && &events[i].key() == key)
        });
        let next = match current {
            Some(current) => (current as isize + delta).clamp(0, items.len() as isize - 1) as usize,
            None => {
                let active = epoch_day(Navigation::active_date(cx));
                let target_day = if items.iter().any(|&(d, ..)| d == active) {
                    Some(active)
                } else {
                    items.iter().map(|&(d, ..)| d).find(|&d| d > active)
                };
                let candidates: Vec<usize> = match target_day {
                    Some(day) => (0..items.len()).filter(|&i| items[i].0 == day).collect(),
                    None => vec![items.len() - 1],
                };
                candidates
                    .iter()
                    .copied()
                    .find(|&i| !items[i].2)
                    .unwrap_or(candidates[0])
            }
        };
        let (day, index, _) = items[next];
        self.select(day, events[index].key(), cx);
        if let Some(section) = self.data.sections.iter().position(|s| s.day == day) {
            self.list.scroll_to_reveal_item(section);
        }
        cx.notify();
    }

    /// Selects a row: highlights its event everywhere and makes its day active.
    fn select(&mut self, day: i32, key: EventKey, cx: &mut Context<Self>) {
        self.focused = Some((day, key.clone()));
        EventStore::global(cx).update(cx, |store, cx| store.set_selected_event(Some(key), cx));
        Navigation::set_active_date(date_from_epoch_day(day), cx);
    }

    /// `Escape`: closes the open event, else drops the selection.
    pub fn dismiss(&mut self, cx: &mut Context<Self>) -> bool {
        let store = EventStore::global(cx);
        if store.read(cx).active_event().is_some() {
            store.update(cx, |store, cx| store.set_active_event(None, cx));
            return true;
        }
        if self.focused.take().is_some() {
            store.update(cx, |store, cx| store.set_selected_event(None, cx));
            return true;
        }
        false
    }

    /// `Enter`: opens the selected row's event beside its row.
    pub fn open_selected(&mut self, cx: &mut Context<Self>) {
        if let Some((_, key)) = self.focused.clone() {
            let anchor = Anchors::event_bounds_in(&key, EventSource::Agenda, cx);
            popover::open_event(key, anchor, cx);
        }
    }

    fn row_clicked(
        &mut self,
        day: i32,
        key: EventKey,
        anchor: Option<Bounds<Pixels>>,
        cx: &mut Context<Self>,
    ) {
        self.select(day, key.clone(), cx);
        popover::toggle_event(key, anchor, cx);
        cx.notify();
    }
}

/// What every section of one render shares.
struct Frame {
    agenda: WeakEntity<Agenda>,
    theme: Arc<ResolvedTheme>,
    palette: Palette,
    numerical: SharedString,
    calendars: Arc<Vec<Calendar>>,
    active: Option<EventKey>,
    focused: Option<(i32, EventKey)>,
    today: NaiveDate,
    viewer: Tz,
    now_ms: i64,
    time_format: TimeFormat,
    padding: Pixels,
}

impl Render for Agenda {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ThemeStore::active(cx);
        let palette = Palette::new(&theme);
        // The loaded events plus the draft (`useEventsWithDraft`).
        let view = ViewEvents::read(false, cx);
        let store = EventStore::global(cx).read(cx);
        let loading = store.is_loading();
        let no_calendars = store.calendars().is_empty();
        let events = view.events.clone();
        let revision = store.revision();
        let calendars = store.calendars().clone();
        let active = store.active_event().cloned();

        if !loading {
            self.rebuild_with(events.clone(), view.revision);
            if !self.initial_scrolled && !self.data.sections.is_empty() {
                self.initial_scrolled = true;
                self.scroll_to_date(Navigation::active_date(cx));
            }
            if let Some((date, from)) = self.pending_regroup
                && revision != from
            {
                self.pending_regroup = None;
                if !events.is_empty() {
                    self.scroll_to_date(date);
                }
                Navigation::set_navigating(false, cx);
            }
        }

        if loading {
            return div().flex_1().into_any_element();
        }
        if no_calendars {
            return get_started(&theme, palette).into_any_element();
        }
        if events.is_empty() {
            return div()
                .p_2()
                .text_size(text_size(&theme, "sm"))
                .text_color(palette.muted)
                .child("No events")
                .into_any_element();
        }

        let clock = *Clock::global(cx);
        let frame = Rc::new(Frame {
            agenda: cx.entity().downgrade(),
            palette,
            numerical: Role::Numerical.family(cx),
            calendars,
            active,
            focused: self.focused.clone(),
            today: clock.today,
            viewer: clock.viewer,
            now_ms: clock.now.timestamp_millis(),
            time_format: Settings::global(cx).time_format(),
            padding: metric(&theme, "layout.padding"),
            theme,
        });
        let data = self.data.clone();
        let sticky = self.sticky_header(&frame);
        let list_frame = frame.clone();
        let list_data = data.clone();

        div()
            .id("agenda")
            .relative()
            .flex_1()
            .min_h_0()
            .overflow_hidden()
            .bg(palette.sidebar)
            .child(measure(cx.entity().downgrade(), Self::set_bounds))
            .child(
                list(self.list.clone(), move |index, _, _| {
                    section(&list_frame, &list_data, index)
                })
                .size_full(),
            )
            .children(sticky)
            .into_any_element()
    }
}

impl Agenda {
    /// The top section's day header pinned to the top, pushed up by the next
    /// section's header (the old `sticky` date bars).
    fn sticky_header(&self, frame: &Frame) -> Option<AnyElement> {
        let top = self.list.logical_scroll_top();
        let section = self.data.sections.get(top.item_ix)?;
        if top.offset_in_item <= px(0.) {
            return None;
        }
        let shift = self
            .list
            .bounds_for_item(top.item_ix + 1)
            .map(|next| f32::from(next.top() - self.bounds.top()) - DATE_BAR_HEIGHT)
            .unwrap_or(0.0)
            .min(0.0);
        Some(
            date_bar(frame, section.day)
                .absolute()
                .top(px(shift))
                .left_0()
                .right_0()
                .into_any_element(),
        )
    }
}

fn get_started(theme: &ResolvedTheme, palette: Palette) -> impl IntoElement + use<> {
    v_flex()
        .items_center()
        .gap_2()
        .p_6()
        .child(
            div()
                .text_center()
                .text_size(text_size(theme, "sm"))
                .text_color(palette.muted)
                .child("Connect your calendar to get started."),
        )
        .child(
            Button::new("connect-calendar")
                .primary()
                .small()
                .mt_2()
                .label("Connect a calendar")
                .on_click(|_, window, cx| {
                    connect::open(ConnectStep::SelectProvider, true, window, cx);
                }),
        )
}

fn date_bar(frame: &Frame, day: i32) -> gpui_kit::Div {
    let theme = &frame.theme;
    let date = date_from_epoch_day(day);
    let is_today = date == frame.today;
    let palette = frame.palette;
    // Between the xs and sm steps, so it follows the theme's type scale.
    let size = (text_size(theme, "xs") + text_size(theme, "sm")) / 2.0;
    h_flex()
        .h(px(DATE_BAR_HEIGHT))
        .flex_shrink_0()
        .items_center()
        .gap_2()
        .py_1p5()
        .px(frame.padding)
        .bg(palette.sidebar)
        .font_family(frame.numerical.clone())
        .text_size(size)
        .when(is_today, |this| this.text_color(palette.today))
        .child(
            div()
                .font_weight(FontWeight::BOLD)
                .child(relative_day_label(date, frame.today).to_uppercase()),
        )
        .child(
            div()
                .text_color(if is_today {
                    palette.today
                } else {
                    palette.muted
                })
                .child(Role::Numerical.text(theme, &format_day_month(date, frame.today))),
        )
}

fn section(frame: &Frame, data: &Data, index: usize) -> AnyElement {
    let Some(section) = data.sections.get(index) else {
        return div().into_any_element();
    };
    let theme = &frame.theme;
    let palette = frame.palette;
    let day = section.day;
    v_flex()
        .w_full()
        .border_b_1()
        .border_color(palette.border)
        .child(date_bar(frame, day))
        .child(
            v_flex()
                .gap_1()
                .pb_2()
                .when(
                    section.all_day.is_empty() && section.timed.is_empty(),
                    |this| {
                        this.child(
                            div()
                                .px(frame.padding)
                                .py_1()
                                .text_size(text_size(theme, "sm"))
                                .text_color(palette.muted)
                                .child("No events"),
                        )
                    },
                )
                .when(!section.all_day.is_empty(), |this| {
                    this.child(
                        h_flex()
                            .flex_wrap()
                            .gap_1()
                            .pb_1()
                            .px(frame.padding)
                            .children(
                                section
                                    .all_day
                                    .iter()
                                    .map(|&i| all_day_chip(frame, &data.events[i], day)),
                            ),
                    )
                })
                .children(
                    section
                        .timed
                        .iter()
                        .map(|&i| timed_row(frame, &data.events[i], day)),
                ),
        )
        .into_any_element()
}

fn row_id(prefix: &str, event: &CalendarEvent, day: i32) -> ElementId {
    ElementId::Name(format!("{prefix}:{day}:{}", event.key().0).into())
}

fn on_row_click(
    frame: &Frame,
    event: &CalendarEvent,
    day: i32,
) -> impl Fn(&gpui_kit::ClickEvent, &mut Window, &mut App) + use<> {
    let agenda = frame.agenda.clone();
    let key = event.key();
    move |e, _, cx| {
        let key = key.clone();
        let anchor = Anchors::event_bounds(&key, Some(e.position()), cx);
        agenda
            .update(cx, |agenda, cx| agenda.row_clicked(day, key, anchor, cx))
            .ok();
    }
}

fn is_selected(frame: &Frame, event: &CalendarEvent, day: i32) -> bool {
    let key = event.key();
    frame.active.as_ref() == Some(&key)
        || frame
            .focused
            .as_ref()
            .is_some_and(|(d, k)| *d == day && *k == key)
}

fn all_day_chip(frame: &Frame, event: &CalendarEvent, day: i32) -> AnyElement {
    let theme = &frame.theme;
    let paint = event_paint(event, &frame.calendars, theme);
    let selected = is_selected(frame, event, day);
    let rsvp = Rsvp::of(event, &frame.calendars);
    let draft = event.id == DRAFT_ID;
    let faded = !draft && Rsvp::is_faded(rsvp);
    let chip = div()
        .id(row_id("agenda-chip", event, day))
        .relative()
        .px(metric(theme, "event.padding_x"))
        .py(px(1.))
        .line_height(px(16.))
        .rounded(radius(theme, 0.4))
        .text_size(text_size(theme, "xs"))
        .map(|this| {
            if draft {
                draft_style(this, &paint)
            } else if faded {
                this.border_1()
                    .border_dashed()
                    .border_color(paint.color)
                    .text_color(paint.declined_text)
                    .opacity(0.5)
            } else {
                this.bg(if selected {
                    paint.selected_fill
                } else {
                    paint.fill
                })
                .text_color(paint.text)
            }
        })
        .when(!draft && rsvp == Some(Rsvp::Declined), |this| {
            this.line_through()
        })
        .child(event_title(&event.summary, frame.palette.muted));
    // The draft is a stand-in: no click.
    if draft {
        return chip.into_any_element();
    }
    chip.on_click(on_row_click(frame, event, day))
        .child(event_anchor(event.key(), EventSource::Agenda))
        .into_any_element()
}

fn timed_row(frame: &Frame, event: &CalendarEvent, day: i32) -> AnyElement {
    let theme = &frame.theme;
    let palette = frame.palette;
    let paint = event_paint(event, &frame.calendars, theme);
    let selected = is_selected(frame, event, day);
    let rsvp = Rsvp::of(event, &frame.calendars);
    let draft = event.id == DRAFT_ID;
    let links = EventLinks::from(event);
    let join_url = links
        .meeting_url()
        .filter(|_| is_within_join_window(&event.date_info, frame.now_ms));
    let row = h_flex()
        .id(row_id("agenda-row", event, day))
        .relative()
        .gap_3()
        .py_1()
        .px(frame.padding)
        .map(|this| {
            if draft {
                draft_style(this, &paint)
            } else if selected {
                this.bg(palette.selected).text_color(palette.selected_text)
            } else {
                this.hover(move |style| style.bg(palette.hover))
            }
        })
        .when(!draft && Rsvp::is_faded(rsvp), |this| this.opacity(0.5))
        .when(!draft && rsvp == Some(Rsvp::Declined), |this| {
            this.line_through()
        })
        .when(!draft, |this| {
            this.on_click(on_row_click(frame, event, day))
                .child(event_anchor(event.key(), EventSource::Agenda))
        })
        .child(
            div()
                .w(px(3.))
                .flex_shrink_0()
                .self_stretch()
                .rounded(radius(theme, 0.4))
                .bg(paint.color),
        )
        .child(
            v_flex()
                .flex_1()
                .min_w_0()
                .text_size(text_size(theme, "sm"))
                .child(
                    h_flex()
                        .h_4()
                        .items_center()
                        .gap_1p5()
                        .font_family(frame.numerical.clone())
                        .text_size(text_size(theme, "xs"))
                        .text_color(palette.muted)
                        .child(Role::Numerical.text(
                            theme,
                            &time_label(event, day, frame.time_format, frame.viewer),
                        ))
                        .when(links.has_video_meeting(), |this| {
                            this.child(Icon::new(RenIcon::Video).size_3().flex_shrink_0())
                        }),
                )
                .child(
                    div()
                        .font_weight(FontWeight::MEDIUM)
                        .line_height(line_height(theme, "sm"))
                        .child(event_title(&event.summary, palette.muted)),
                ),
        )
        .when_some(join_url, |this, url| {
            this.child(
                Button::new(row_id("agenda-join", event, day))
                    .primary()
                    .xsmall()
                    .rounded(ButtonRounded::Large)
                    .self_center()
                    .label("Join")
                    .on_click(move |_, _, cx| {
                        // Joining must not also toggle the row's event.
                        cx.stop_propagation();
                        cx.open_url(&url);
                    }),
            )
        });
    row.into_any_element()
}

/// The draft's look (`[data-draft]`): a dashed accent border over a light
/// tint.
fn draft_style<E: Styled>(element: E, paint: &EventPaint) -> E {
    element
        .border_1()
        .border_dashed()
        .border_color(paint.color)
        .bg(paint.draft_fill)
        .text_color(paint.draft_text)
        .font_weight(FontWeight::MEDIUM)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event_store::test_events::{all_day, timed};

    #[test]
    fn sections_split_full_days_from_timed_rows_and_add_a_ghost() {
        let utc = chrono_tz::UTC;
        let events = vec![
            timed("b", "Later", "2026-10-07 15:00", "2026-10-07 16:00", utc),
            timed("a", "Earlier", "2026-10-07 09:00", "2026-10-07 10:00", utc),
            all_day("c", "Trip", "2026-10-07", "2026-10-09", utc),
            timed(
                "d",
                "Overnight",
                "2026-10-09 22:00",
                "2026-10-11 02:00",
                utc,
            ),
        ];
        let day = |s: &str| epoch_day(s.parse().unwrap());
        let sections = build_sections(&events, Some(day("2026-10-20")));
        let days: Vec<i32> = sections.iter().map(|s| s.day).collect();
        assert_eq!(
            days,
            vec![
                day("2026-10-07"),
                day("2026-10-08"),
                day("2026-10-09"),
                day("2026-10-10"),
                day("2026-10-11"),
                day("2026-10-20"),
            ]
        );
        assert_eq!(sections[0].timed, vec![1, 0]);
        assert_eq!(sections[0].all_day, vec![2]);
        // The middle of a multi-day timed event is a chip.
        assert_eq!(sections[3].all_day, vec![3]);
        assert_eq!(sections[4].timed, vec![3]);
        assert!(sections[5].ghost && !sections[0].ghost);

        assert_eq!(
            time_label(&events[3], day("2026-10-09"), TimeFormat::H24, utc),
            "Starts at 22:00"
        );
        assert_eq!(
            time_label(&events[3], day("2026-10-11"), TimeFormat::H24, utc),
            "Ends at 02:00"
        );
        assert_eq!(
            time_label(&events[0], day("2026-10-07"), TimeFormat::H24, utc),
            "15:00 - 16:00"
        );
    }
}
