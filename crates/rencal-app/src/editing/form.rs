//! `EventForm` (ports of `EventInfo.tsx`, `EditEvent.tsx`,
//! `ComposeEvent.tsx` and `DateTimeSelect.tsx`): the event editor in the
//! popover, the narrow sheet and the sidebar compose card.
//!
//! - Editing keeps a working copy and saves it when the form closes
//!   (`finish`) if it differs from the original, through
//!   `commands::request_save` (which asks about recurring scope).
//! - Composing edits `DraftState`'s draft directly; "Add Event" (or Enter in
//!   the title) asks the owner to create it.
//! - Read-only events (read-only calendars, events the user doesn't
//!   organise) show only the fields that have values.
//!
//! A foreign-zone event shows its times in the viewer's zone, locked, until
//! the zone switch unlocks editing in the event's own zone.

use gpui_kit::component::button::{Button, ButtonVariants};
use gpui_kit::component::checkbox::Checkbox;
use gpui_kit::component::input::{Input, InputEvent, InputState, Textarea, TextareaState};
use gpui_kit::component::menu::{DropdownMenu, PopupMenuItem};
use gpui_kit::component::popover::Popover;
use gpui_kit::component::tooltip::Tooltip;
use gpui_kit::component::{Icon, Sizable, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    AnyElement, App, AppContext, Context, Entity, EventEmitter, FocusHandle, Focusable, FontWeight,
    InteractiveElement, IntoElement, ParentElement, Render, SharedString,
    StatefulInteractiveElement, Styled, Subscription, Window, div, px,
};
use rencal_text::conference::{
    EventLinks, calendar_conference_provider, conference_for_calendar, conference_label,
    detect_conference,
};
use rencal_text::event_url::to_openable_url;
use rencal_text::recurrence::{RRule, RRuleSet, repeat_label, repeat_presets, selected_preset};
use rencal_theme::ResolvedTheme;
use rencal_time::constants::DEFAULT_DURATION_MINS;
use rencal_time::event::{EventConference, Recurrence, ResponseStatus};
use rencal_time::{Calendar, CalendarEvent, EventTimeRange, Tz};

use super::commands;
use super::draft::DraftState;
use super::fields::attendees::{AttendeesChanged, AttendeesField, status_dot};
use super::fields::date::{DateChanged, DateField};
use super::fields::reminders::{ReminderEvent, ReminderField};
use super::fields::time::{TimeChanged, TimeField};
use super::fields::timezone::{TzChanged, TzField};
use super::fields::{ControlTrigger, Controls, remove_button};
use crate::assets::RenIcon;
use crate::clock::Clock;
use crate::event_store::EventStore;
use crate::keymap::DuplicateEvent;
use crate::settings::Settings;
use crate::theme::ThemeStore;
use crate::theme::hsla;
use crate::ui::event_paint::calendar_accent;
use crate::ui::{Role, color, text_size};

/// What the form edits.
#[derive(Clone, Debug, PartialEq)]
pub enum FormKind {
    /// A stored event; saved on close when changed.
    Edit { original: Box<CalendarEvent> },
    /// `DraftState`'s draft; created with "Add Event".
    Compose,
}

/// What the form asks its owner to do.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FormEvent {
    /// Enter in the title, location or link (the old `onClose`): close an
    /// edit; create a draft.
    Done,
}

pub struct EventForm {
    kind: FormKind,
    event: CalendarEvent,
    focus: FocusHandle,
    summary: Entity<TextareaState>,
    location: Entity<TextareaState>,
    url: Entity<InputState>,
    notes: Entity<TextareaState>,
    start_time: Entity<TimeField>,
    end_time: Entity<TimeField>,
    start_date: Entity<DateField>,
    end_date: Entity<DateField>,
    tz: Entity<TzField>,
    reminders: Entity<ReminderField>,
    attendees: Entity<AttendeesField>,
    /// The last timed range, restored when all-day is switched off
    /// (`useLastTimedRange`).
    last_timed: Option<EventTimeRange>,
    tz_requested: bool,
    /// The foreign zone the user unlocked for editing.
    unlocked_tz: Option<Tz>,
    /// Set while the form pushes values into its inputs.
    syncing: bool,
    /// The repeat and calendar selects.
    repeat_open: bool,
    calendar_open: bool,
    _subscriptions: Vec<Subscription>,
}

impl EventEmitter<FormEvent> for EventForm {}

impl Focusable for EventForm {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus.clone()
    }
}

fn textarea(
    placeholder: &str,
    submit_on_enter: bool,
    window: &mut Window,
    cx: &mut App,
) -> Entity<TextareaState> {
    let placeholder = SharedString::from(placeholder.to_owned());
    cx.new(|cx| {
        let mut state = TextareaState::new(window, cx)
            .auto_grow(1, 12)
            .placeholder(placeholder);
        state.set_submit_on_enter(submit_on_enter, cx);
        state
    })
}

impl EventForm {
    pub fn edit(event: CalendarEvent, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let kind = FormKind::Edit {
            original: Box::new(event.clone()),
        };
        Self::new(kind, event, window, cx)
    }

    pub fn compose(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let draft_state = DraftState::global(cx);
        let draft = draft_state.read(cx).draft().clone();
        let mut form = Self::new(FormKind::Compose, draft, window, cx);
        form._subscriptions.push(
            cx.observe_in(&draft_state, window, |this, state, window, cx| {
                let draft = state.read(cx).draft().clone();
                if draft != this.event {
                    this.set_event(draft, window, cx);
                }
            }),
        );
        form
    }

    fn new(
        kind: FormKind,
        event: CalendarEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let editable = match &kind {
            FormKind::Edit { .. } => {
                !event.is_readonly(EventStore::global(cx).read(cx).calendars())
            }
            FormKind::Compose => true,
        };
        let summary = textarea("Event Title", true, window, cx);
        let location = textarea("Location", true, window, cx);
        let notes = textarea("Notes", false, window, cx);
        let url = cx.new(|cx| InputState::new(window, cx).placeholder("Add link"));
        let start_time = cx.new(|cx| TimeField::new(window, cx));
        let end_time = cx.new(|cx| TimeField::new(window, cx));
        let start_date = cx.new(|cx| DateField::new(window, cx));
        let end_date = cx.new(|cx| DateField::new(window, cx));
        let tz = cx.new(|cx| TzField::new(window, cx));
        let reminders = cx.new(|cx| ReminderField::new(window, cx));
        let attendees = cx.new(|cx| AttendeesField::new(editable, window, cx));

        let text_change = |field: fn(&mut CalendarEvent, String), submit: bool| {
            move |this: &mut Self,
                  state: &Entity<TextareaState>,
                  event: &InputEvent,
                  window: &mut Window,
                  cx: &mut Context<Self>| {
                match event {
                    InputEvent::Change if !this.syncing => {
                        let value = state.read(cx).value().to_string();
                        this.apply(|event| field(event, value), window, cx);
                    }
                    InputEvent::PressEnter { .. } if submit => cx.emit(FormEvent::Done),
                    _ => {}
                }
            }
        };
        let subscriptions = vec![
            cx.subscribe_in(&summary, window, text_change(|e, v| e.summary = v, true)),
            cx.subscribe_in(
                &location,
                window,
                text_change(|e, v| e.location = non_empty(v), true),
            ),
            cx.subscribe_in(
                &notes,
                window,
                text_change(|e, v| e.description = non_empty(v), false),
            ),
            cx.subscribe_in(
                &url,
                window,
                |this, state, event: &InputEvent, window, cx| match event {
                    InputEvent::Change if !this.syncing => {
                        let value = state.read(cx).value().to_string();
                        this.apply(|event| event.url = non_empty(value), window, cx);
                    }
                    InputEvent::PressEnter { .. } => cx.emit(FormEvent::Done),
                    _ => {}
                },
            ),
            cx.subscribe_in(
                &start_time,
                window,
                |this, _, TimeChanged((h, m)), window, cx| {
                    let viewer = viewer(cx);
                    let range = this.range().with_start_wallclock_time(*h, *m, viewer);
                    this.set_range(range, window, cx);
                },
            ),
            cx.subscribe_in(
                &end_time,
                window,
                |this, _, TimeChanged((h, m)), window, cx| {
                    let viewer = viewer(cx);
                    let range = this.range().with_end_wallclock_time(*h, *m, viewer);
                    this.set_range(range, window, cx);
                },
            ),
            cx.subscribe_in(
                &start_date,
                window,
                |this, _, DateChanged(date), window, cx| {
                    let range = this.range().with_start_date(*date, viewer(cx));
                    this.set_range(range, window, cx);
                },
            ),
            cx.subscribe_in(
                &end_date,
                window,
                |this, _, DateChanged(date), window, cx| {
                    let range = this.range().with_display_end_date(*date, viewer(cx));
                    this.set_range(range, window, cx);
                },
            ),
            cx.subscribe_in(&tz, window, |this, _, TzChanged(tz), window, cx| {
                this.tz_requested = true;
                this.unlocked_tz = Some(*tz);
                let range = this.range().with_time_zone(*tz, viewer(cx));
                this.set_range(range, window, cx);
            }),
            cx.subscribe_in(
                &reminders,
                window,
                |this, _, event: &ReminderEvent, window, cx| match *event {
                    ReminderEvent::Add(mins) => this.apply(
                        |e| {
                            if !e.reminders.contains(&mins) {
                                e.reminders.push(mins);
                            }
                        },
                        window,
                        cx,
                    ),
                    ReminderEvent::Remove(mins) => {
                        this.apply(|e| e.reminders.retain(|m| *m != mins), window, cx)
                    }
                },
            ),
            cx.subscribe_in(
                &attendees,
                window,
                |this, _, AttendeesChanged(list), window, cx| {
                    let list = list.clone();
                    this.apply(|e| e.attendees = list, window, cx);
                },
            ),
            cx.observe_global::<Settings>(|_, cx| cx.notify()),
            cx.observe_global::<ThemeStore>(|_, cx| cx.notify()),
        ];

        let mut form = Self {
            kind,
            event: event.clone(),
            focus: cx.focus_handle(),
            summary,
            location,
            url,
            notes,
            start_time,
            end_time,
            start_date,
            end_date,
            tz,
            reminders,
            attendees,
            last_timed: None,
            tz_requested: false,
            unlocked_tz: None,
            syncing: false,
            repeat_open: false,
            calendar_open: false,
            _subscriptions: subscriptions,
        };
        form.set_event(event, window, cx);
        form
    }

    pub fn event(&self) -> &CalendarEvent {
        &self.event
    }

    #[cfg(test)]
    pub fn start_time(&self) -> &Entity<TimeField> {
        &self.start_time
    }

    #[cfg(test)]
    pub fn title_focused(&self, window: &Window, cx: &App) -> bool {
        self.summary.read(cx).focus_handle(cx).is_focused(window)
    }

    pub fn kind(&self) -> &FormKind {
        &self.kind
    }

    /// The title field, where focus enters the form.
    pub fn focus_entry(&self, window: &mut Window, cx: &mut App) {
        self.summary
            .update(cx, |summary, cx| summary.focus(window, cx));
    }

    /// Saves an edit that changed anything (`EditEvent`'s unmount save).
    pub fn finish(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let FormKind::Edit { original } = &self.kind
            && self.event != **original
        {
            let (current, original) = (self.event.clone(), (**original).clone());
            // Don't save twice if `finish` runs again.
            self.kind = FormKind::Edit {
                original: Box::new(current.clone()),
            };
            commands::request_save(current, original, window, cx);
        }
    }

    fn range(&self) -> EventTimeRange {
        EventTimeRange::new(self.event.start.clone(), self.event.end.clone())
    }

    fn set_range(&mut self, range: EventTimeRange, window: &mut Window, cx: &mut Context<Self>) {
        self.apply(
            |event| {
                event.start = range.start;
                event.end = range.end;
            },
            window,
            cx,
        );
    }

    /// Applies an edit to the working copy (and the draft when composing).
    fn apply(
        &mut self,
        edit: impl FnOnce(&mut CalendarEvent),
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let mut event = self.event.clone();
        edit(&mut event);
        event.refresh_date_info(viewer(cx));
        if event == self.event {
            return;
        }
        if self.kind == FormKind::Compose {
            let draft = event.clone();
            DraftState::global(cx).update(cx, |state, cx| state.update_draft(|d| *d = draft, cx));
        }
        self.set_event(event, window, cx);
    }

    /// Shows `event`, pushing its values into the inputs.
    fn set_event(&mut self, event: CalendarEvent, window: &mut Window, cx: &mut Context<Self>) {
        let viewer = viewer(cx);
        if !event.start.is_all_day() {
            self.last_timed = Some(EventTimeRange::new(event.start.clone(), event.end.clone()));
        }
        self.event = event;
        self.syncing = true;
        let set_text =
            |state: &Entity<TextareaState>, value: &str, window: &mut Window, cx: &mut App| {
                if state.read(cx).value() != value {
                    let value = value.to_owned();
                    state.update(cx, |state, cx| state.set_value(value, window, cx));
                }
            };
        set_text(&self.summary, &self.event.summary.clone(), window, cx);
        set_text(
            &self.location,
            &self.event.location.clone().unwrap_or_default(),
            window,
            cx,
        );
        set_text(
            &self.notes,
            &self.event.description.clone().unwrap_or_default(),
            window,
            cx,
        );
        let url = self.event.url.clone().unwrap_or_default();
        if self.url.read(cx).value() != url {
            self.url
                .update(cx, |state, cx| state.set_value(url, window, cx));
        }
        self.syncing = false;

        let format = Settings::global(cx).time_format();
        let dt = self.date_time_state(viewer);
        let (start_time, end_time) = match &dt.time_range {
            Some(range) => (
                Some(range.start.wallclock_time(viewer)),
                Some(range.end.wallclock_time(viewer)),
            ),
            None => (None, None),
        };
        self.start_time
            .update(cx, |f, cx| f.set_value(start_time, format, window, cx));
        self.end_time
            .update(cx, |f, cx| f.set_value(end_time, format, window, cx));
        let start_date = dt.shown.start.date_in_event_zone(viewer);
        let end_date = dt.shown.display_end_date(viewer);
        self.start_date
            .update(cx, |f, cx| f.set_value(start_date, window, cx));
        self.end_date
            .update(cx, |f, cx| f.set_value(end_date, window, cx));
        let (tz, at) = (dt.shown.start.event_tz(viewer), dt.shown.start.clone());
        self.tz.update(cx, |f, _| f.set_value(tz, at, viewer));
        let (attendees, organizer) = (self.event.attendees.clone(), self.event.organizer.clone());
        self.attendees
            .update(cx, |f, _| f.set_value(&attendees, organizer.as_ref()));
        cx.notify();
    }

    fn date_time_state(&self, viewer: Tz) -> DateTimeState {
        let range = self.range();
        let all_day = range.start.is_all_day();
        let tz = range.start.event_tz(viewer);
        let foreign = !all_day && tz != viewer;
        let locked = foreign && self.unlocked_tz != Some(tz);
        let shown = if locked {
            range.with_viewer_zone(viewer)
        } else {
            range
        };
        DateTimeState {
            all_day,
            foreign,
            locked,
            show_tz: !all_day && (self.tz_requested || foreign),
            time_range: if all_day {
                self.last_timed.clone()
            } else {
                Some(shown.clone())
            },
            shown,
        }
    }

    fn set_all_day(&mut self, all_day: bool, window: &mut Window, cx: &mut Context<Self>) {
        let viewer = viewer(cx);
        let range = self.range();
        let next = if all_day {
            let start = range.start.to_all_day(viewer);
            EventTimeRange::normalize_all_day(start, range.end.to_all_day(viewer), viewer)
        } else {
            let timed_start = if range.start.is_all_day() {
                range.start.to_timed_at_start_of_day(viewer)
            } else {
                range.start.clone()
            };
            match &self.last_timed {
                Some(last) => last.clone(),
                None => EventTimeRange::new(
                    timed_start.clone(),
                    timed_start.add_minutes(i64::from(DEFAULT_DURATION_MINS)),
                ),
            }
        };
        self.set_range(next, window, cx);
    }

    fn set_calendar(&mut self, slug: String, window: &mut Window, cx: &mut Context<Self>) {
        let calendar = EventStore::global(cx).read(cx).calendar(&slug).cloned();
        self.calendar_open = false;
        self.apply(
            |event| {
                event.conference =
                    conference_for_calendar(event.conference.take(), calendar.as_ref());
                event.calendar_slug = slug;
            },
            window,
            cx,
        );
    }

    fn set_recurrence(&mut self, rule: Option<RRule>, window: &mut Window, cx: &mut Context<Self>) {
        let viewer = viewer(cx);
        self.repeat_open = false;
        let recurrence = rule.map(|rule| RRuleSet::new(rule).to_recurrence(viewer));
        self.apply(|event| event.recurrence = recurrence, window, cx);
    }
}

fn non_empty(value: String) -> Option<String> {
    (!value.is_empty()).then_some(value)
}

fn viewer(cx: &App) -> Tz {
    Clock::global(cx).viewer
}

struct DateTimeState {
    all_day: bool,
    foreign: bool,
    locked: bool,
    show_tz: bool,
    /// The times shown: the event's, or its last timed range when all-day.
    time_range: Option<EventTimeRange>,
    /// The range as shown (in the viewer's zone while locked).
    shown: EventTimeRange,
}

/// What one render of the form shares.
struct Frame<'a> {
    theme: &'a ResolvedTheme,
    controls: Controls,
    calendars: &'a [Calendar],
    readonly: bool,
    viewer: Tz,
}

impl Render for EventForm {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ThemeStore::active(cx);
        let store = EventStore::global(cx).read(cx);
        let calendars = store.calendars().clone();
        let editing = matches!(self.kind, FormKind::Edit { .. });
        let readonly = editing && self.event.is_readonly(&calendars);
        let frame = Frame {
            theme: &theme,
            controls: Controls::new(&theme),
            calendars: &calendars,
            readonly,
            viewer: viewer(cx),
        };
        let event = self.event.clone();
        let can_edit = !readonly;
        let has_summary = !event.summary.trim().is_empty();
        let show_summary = can_edit || has_summary;
        let has_attendees = !event.attendees.is_empty();
        let response = editing
            .then(|| event.user_response_status(&calendars))
            .flatten();

        let section = |flush_top: bool, flush_bottom: bool| {
            v_flex()
                .gap(frame.controls.row_gap)
                .py_2()
                .when(flush_top, |this| this.pt_0())
                .when(flush_bottom, |this| this.pb_0())
        };
        let separator = || div().h(px(1.)).bg(frame.controls.border.opacity(0.75));

        let summary = show_summary.then(|| {
            section(true, false).child(
                frame.controls.row("summary", false, can_edit).child(
                    div().flex_1().min_w_0().child(
                        Textarea::new(&self.summary)
                            .appearance(false)
                            .px_0()
                            .readonly(readonly)
                            .text_size(text_size(&theme, "base"))
                            .font_weight(FontWeight::MEDIUM),
                    ),
                ),
            )
        });

        let before_attendees: Vec<AnyElement> = [
            (can_edit
                || event
                    .location
                    .as_deref()
                    .is_some_and(|l| !l.trim().is_empty()))
            .then(|| self.location_field(&frame).into_any_element()),
            Some(self.date_time_field(&frame, window, cx).into_any_element()),
            (can_edit || event.start.is_all_day())
                .then(|| self.all_day_field(&frame, cx).into_any_element()),
            (can_edit || event.recurrence.is_some() || event.master_recurrence.is_some())
                .then(|| self.repeat_field(&frame, cx).into_any_element()),
            self.conference_field(&frame, cx)
                .map(IntoElement::into_any_element),
        ]
        .into_iter()
        .flatten()
        .collect();
        let attendees_field = (has_attendees || can_edit).then(|| {
            self.attendees.update(cx, |field, cx| {
                field
                    .render_field(&theme, frame.controls, can_edit, window, cx)
                    .into_any_element()
            })
        });
        let after_attendees: Vec<AnyElement> = [
            self.url_field(&frame).map(IntoElement::into_any_element),
            Some(
                self.reminders
                    .update(cx, |field, cx| {
                        field.render_field(&event.reminders, frame.controls, window, cx)
                    })
                    .into_any_element(),
            ),
            Some(self.calendar_field(&frame, cx).into_any_element()),
            (can_edit
                || event
                    .description
                    .as_deref()
                    .is_some_and(|d| !d.trim().is_empty()))
            .then(|| self.notes_field(&frame).into_any_element()),
        ]
        .into_iter()
        .flatten()
        .collect();
        let rsvp = response.map(|status| rsvp_field(&event, status, &frame));

        let fields = if has_attendees {
            v_flex()
                .child(section(!show_summary, false).children(before_attendees))
                .child(separator())
                .child(section(false, false).children(attendees_field))
                .child(separator())
                .child(section(false, rsvp.is_none()).children(after_attendees))
        } else {
            v_flex().child(
                section(!show_summary, rsvp.is_none())
                    .children(before_attendees)
                    .children(attendees_field)
                    .children(after_attendees),
            )
        };

        v_flex()
            .id("event-form")
            .track_focus(&self.focus)
            .px_2()
            .pt_2()
            .pb_2()
            .text_color(color(&theme, "elevated_surface.text"))
            .when(editing, |this| {
                this.child(
                    h_flex()
                        .justify_end()
                        .pb_1()
                        .when(can_edit, |this| this.child(overflow_menu(&event, cx))),
                )
            })
            .children(summary)
            .when(show_summary, |this| this.child(separator()))
            .child(fields)
            .when_some(rsvp, |this, rsvp| {
                this.child(separator())
                    .child(section(false, true).child(rsvp))
            })
            .when(!editing, |this| {
                this.child(
                    div().py_2().child(
                        Button::new("add-event")
                            .primary()
                            .w_full()
                            .label(Role::Button.text(&theme, "Add Event"))
                            .on_click(cx.listener(|_, _, _, cx| cx.emit(FormEvent::Done))),
                    ),
                )
            })
    }
}

impl EventForm {
    fn location_field(&self, frame: &Frame) -> impl IntoElement + use<> {
        frame
            .controls
            .row("location", false, !frame.readonly)
            .items_start()
            .child(
                frame
                    .controls
                    .leading(Some(RenIcon::Pushpin))
                    .h(frame.controls.height - px(2.)),
            )
            .child(
                div().flex_1().min_w_0().py_1p5().child(
                    Textarea::new(&self.location)
                        .appearance(false)
                        .px_0()
                        .readonly(frame.readonly),
                ),
            )
    }

    fn notes_field(&self, frame: &Frame) -> impl IntoElement + use<> {
        frame.controls.row("notes", false, !frame.readonly).child(
            div().flex_1().min_w_0().py_1p5().child(
                Textarea::new(&self.notes)
                    .appearance(false)
                    .px_0()
                    .readonly(frame.readonly),
            ),
        )
    }

    fn date_time_field(
        &mut self,
        frame: &Frame,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let controls = frame.controls;
        let dt = self.date_time_state(frame.viewer);
        let today = Clock::global(cx).today;
        let first_day = Settings::global(cx).first_day_of_week();
        let inputs_readonly = frame.readonly || dt.locked;
        let time_row = dt.time_range.is_some();
        // Shared column widths keep the end fields aligned across the rows.
        let first_column = controls.padding_x * 2.0 + controls.leading + controls.gap + px(86.);

        let time = time_row.then(|| {
            let start = self.start_time.update(cx, |field, cx| {
                field.render_field(
                    "time-start",
                    controls,
                    Some(controls.leading(Some(RenIcon::Clock))),
                    inputs_readonly,
                    dt.all_day,
                    window,
                    cx,
                )
            });
            let end = self.end_time.update(cx, |field, cx| {
                field.render_field(
                    "time-end",
                    controls,
                    None,
                    inputs_readonly,
                    dt.all_day,
                    window,
                    cx,
                )
            });
            h_flex()
                .items_center()
                .child(div().w(first_column).child(start))
                .child(
                    Icon::new(RenIcon::ArrowRight)
                        .size_4()
                        .flex_none()
                        .text_color(controls.muted),
                )
                .child(end)
        });

        let start_date = self.start_date.update(cx, |field, cx| {
            field.render_field(
                "date-start",
                controls,
                Some(controls.leading((!time_row).then_some(RenIcon::Clock))),
                today,
                first_day,
                inputs_readonly,
                cx,
            )
        });
        let end_date = dt
            .shown
            .should_show_display_end_date(frame.viewer)
            .then(|| {
                self.end_date.update(cx, |field, cx| {
                    field.render_field(
                        "date-end",
                        controls,
                        None,
                        today,
                        first_day,
                        inputs_readonly,
                        cx,
                    )
                })
            });
        let can_add_tz = !dt.all_day && !frame.readonly && !dt.show_tz;
        let add_tz = can_add_tz.then(|| {
            Button::new("add-timezone")
                .ghost()
                .small()
                .text_color(controls.muted)
                .label("Add timezone")
                .on_click(cx.listener(|this, _, window, cx| {
                    this.tz_requested = true;
                    this.tz.update(cx, |tz, cx| tz.set_open(true, window, cx));
                    cx.notify();
                }))
        });
        let date = h_flex()
            .items_center()
            .child(div().w(first_column).child(start_date))
            .child(div().w(px(16.)).flex_none())
            .child(
                h_flex()
                    .flex_wrap()
                    .items_center()
                    .children(end_date)
                    .children(add_tz),
            );

        let zone = dt.show_tz.then(|| {
            let locked = dt.locked;
            let switch_label = if locked {
                if frame.readonly {
                    "Show in event's time zone"
                } else {
                    "Switch to event's time zone to edit"
                }
            } else {
                "Show in your time zone"
            };
            let event_tz = self.event.start.event_tz(frame.viewer);
            h_flex()
                .items_center()
                .gap_1()
                .child(
                    div().flex_1().min_w_0().child(
                        self.tz
                            .update(cx, |tz, cx| tz.render_field(controls, inputs_readonly, cx)),
                    ),
                )
                .when(dt.foreign, |this| {
                    this.child(
                        Button::new("zone-switch")
                            .secondary()
                            .xsmall()
                            .icon(Icon::new(RenIcon::Undo).text_color(controls.muted))
                            .tooltip(switch_label)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.unlocked_tz = if locked { Some(event_tz) } else { None };
                                let event = this.event.clone();
                                this.set_event(event, window, cx);
                            })),
                    )
                })
        });

        v_flex()
            .gap(controls.row_gap)
            .children(time)
            .child(date)
            .children(zone)
    }

    fn all_day_field(&self, frame: &Frame, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let checked = self.event.start.is_all_day();
        let readonly = frame.readonly;
        frame
            .controls
            .row("all-day", false, false)
            .w_auto()
            .h(frame.controls.height)
            .child(
                frame.controls.leading(None).child(
                    Checkbox::new("all-day-checkbox")
                        .checked(checked)
                        .when(!readonly, |this| {
                            this.on_click(cx.listener(move |this, _, window, cx| {
                                this.set_all_day(!checked, window, cx)
                            }))
                        }),
                ),
            )
            .child(
                div()
                    .text_color(if checked {
                        frame.controls.text
                    } else {
                        frame.controls.muted
                    })
                    .child("All-day"),
            )
            .when(!readonly, |this| {
                this.on_click(
                    cx.listener(move |this, _, window, cx| this.set_all_day(!checked, window, cx)),
                )
            })
    }

    fn repeat_field(&self, frame: &Frame, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let controls = frame.controls;
        let recurrence: Option<Recurrence> = self
            .event
            .recurrence
            .clone()
            .or_else(|| self.event.master_recurrence.clone());
        let set = recurrence
            .as_ref()
            .and_then(|r| RRuleSet::from_recurrence(r, frame.viewer).ok());
        let label = match (&recurrence, &set) {
            (_, Some(set)) => Some(repeat_label(set)),
            (Some(r), None) => Some(r.rrule.clone()),
            _ => None,
        };
        let selected = set.as_ref().and_then(selected_preset).map(|p| p.label);
        let selected_none = recurrence.is_none();
        let this = cx.entity().downgrade();
        let options = std::iter::once(("No repeat", None, selected_none))
            .chain(repeat_presets().into_iter().map(|preset| {
                (
                    preset.label,
                    Some(preset.rule),
                    Some(preset.label) == selected,
                )
            }))
            .enumerate()
            .map(|(index, (label, rule, checked))| {
                let this = this.clone();
                controls
                    .option(("repeat-option", index), false)
                    .justify_between()
                    .on_click(move |_, window, cx| {
                        let rule = rule.clone();
                        this.update(cx, |this, cx| this.set_recurrence(rule, window, cx))
                            .ok();
                    })
                    .child(label)
                    .child(check_mark(checked))
                    .into_any_element()
            })
            .collect::<Vec<_>>();
        select(
            "repeat",
            self.repeat_open,
            frame.readonly,
            controls,
            {
                let this = this.clone();
                move |open, cx| {
                    this.update(cx, |this, cx| {
                        this.repeat_open = open;
                        cx.notify();
                    })
                    .ok();
                }
            },
            vec![
                controls.leading(Some(RenIcon::Repeat)).into_any_element(),
                match label {
                    Some(label) => div()
                        .flex_1()
                        .min_w_0()
                        .truncate()
                        .child(label)
                        .into_any_element(),
                    None => div()
                        .flex_1()
                        .text_color(controls.placeholder)
                        .child("Repeat")
                        .into_any_element(),
                },
            ],
            options,
        )
    }

    fn calendar_field(&self, frame: &Frame, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let controls = frame.controls;
        let current = frame
            .calendars
            .iter()
            .find(|c| c.slug == self.event.calendar_slug);
        let swatch = |calendar: &Calendar| {
            div()
                .size_3()
                .flex_none()
                .rounded(px(2.))
                .bg(hsla(calendar_accent(Some(calendar), frame.theme)))
        };
        let this = cx.entity().downgrade();
        let options = frame
            .calendars
            .iter()
            .filter(|c| c.read_only != Some(true))
            .enumerate()
            .map(|(index, calendar)| {
                let this = this.clone();
                let slug = calendar.slug.clone();
                let checked = Some(calendar) == current;
                controls
                    .option(("calendar-option", index), false)
                    .justify_between()
                    .on_click(move |_, window, cx| {
                        let slug = slug.clone();
                        this.update(cx, |this, cx| this.set_calendar(slug, window, cx))
                            .ok();
                    })
                    .child(
                        h_flex()
                            .min_w_0()
                            .gap_2()
                            .child(swatch(calendar))
                            .child(div().truncate().child(calendar_name(calendar))),
                    )
                    .child(check_mark(checked))
                    .into_any_element()
            })
            .collect::<Vec<_>>();
        select(
            "calendar",
            self.calendar_open,
            frame.readonly,
            controls,
            move |open, cx| {
                this.update(cx, |this, cx| {
                    this.calendar_open = open;
                    cx.notify();
                })
                .ok();
            },
            vec![
                controls
                    .leading(None)
                    .children(current.map(swatch))
                    .into_any_element(),
                div()
                    .flex_1()
                    .min_w_0()
                    .truncate()
                    .child(
                        current
                            .map(calendar_name)
                            .unwrap_or_else(|| "Select Calendar".into()),
                    )
                    .into_any_element(),
            ],
            options,
        )
    }

    fn conference_field(&self, frame: &Frame, cx: &mut Context<Self>) -> Option<AnyElement> {
        let controls = frame.controls;
        let theme = frame.theme;
        match &self.event.conference {
            Some(EventConference::Live { provider, url }) => {
                return Some(join_link(
                    url.clone(),
                    conference_label(*provider),
                    theme,
                    controls,
                ));
            }
            Some(EventConference::Requested { provider }) => {
                let provider = *provider;
                let removable = !frame.readonly;
                return Some(
                    frame
                        .controls
                        .row("conference", false, false)
                        .h(controls.height)
                        .group("conference")
                        .hover(move |style| style.bg(controls.highlight))
                        .child(controls.leading(Some(RenIcon::Video)))
                        .child(div().flex_1().truncate().child(conference_label(provider)))
                        .when(removable, |this| {
                            this.child(
                                div()
                                    .invisible()
                                    .group_hover("conference", |style| style.visible())
                                    .child(remove_button(
                                        "remove-conference",
                                        controls,
                                        cx.listener(|this, _, window, cx| {
                                            this.apply(|e| e.conference = None, window, cx)
                                        }),
                                    )),
                            )
                        })
                        .into_any_element(),
                );
            }
            None => {}
        }
        if let Some(detected) = detect_conference(self.event.location.as_deref()) {
            return Some(join_link(detected.url, detected.label, theme, controls));
        }
        let calendar = frame
            .calendars
            .iter()
            .find(|c| c.slug == self.event.calendar_slug);
        let provider = calendar_conference_provider(calendar).filter(|_| !frame.readonly)?;
        Some(
            frame
                .controls
                .row("add-conference", false, true)
                .h(controls.height)
                .text_color(controls.muted)
                .hover(move |style| style.bg(controls.highlight))
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.apply(
                        |e| e.conference = Some(EventConference::Requested { provider }),
                        window,
                        cx,
                    )
                }))
                .child(controls.leading(Some(RenIcon::Video)))
                .child(format!("Add {}", conference_label(provider)))
                .into_any_element(),
        )
    }

    fn url_field(&self, frame: &Frame) -> Option<impl IntoElement + use<>> {
        let controls = frame.controls;
        let url = self.event.url.clone().unwrap_or_default();
        let url = url.trim().to_owned();
        let detected = EventLinks::from(&self.event).detect_url();
        if frame.readonly && url.is_empty() && detected.is_none() {
            return None;
        }
        let detected_row = detected
            .map(|detected| url_link(detected.url, Some(detected.source.label()), controls));
        let field = if frame.readonly {
            (!url.is_empty()).then(|| url_link(url, None, controls).into_any_element())
        } else {
            let open = (!url.is_empty()).then(|| {
                let url = url.clone();
                Button::new("open-link")
                    .ghost()
                    .xsmall()
                    .icon(Icon::new(RenIcon::ArrowUpRight).text_color(controls.muted))
                    .on_click(move |_, _, cx| cx.open_url(&to_openable_url(&url)))
            });
            Some(
                frame
                    .controls
                    .row("url", false, true)
                    .child(controls.leading(Some(RenIcon::Link)))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .child(Input::new(&self.url).appearance(false).px_0()),
                    )
                    .children(open)
                    .into_any_element(),
            )
        };
        Some(
            v_flex()
                .gap(controls.row_gap)
                .children(detected_row)
                .children(field),
        )
    }
}

fn calendar_name(calendar: &Calendar) -> String {
    calendar
        .name
        .clone()
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| calendar.slug.clone())
}

fn check_mark(visible: bool) -> impl IntoElement {
    div().size_4().flex_none().when(visible, |this| {
        this.child(Icon::new(RenIcon::Check).size_4())
    })
}

/// A select: a ghost trigger opening a list (the old `SelectMenuTrigger` +
/// dropdown menu).
fn select(
    id: &'static str,
    open: bool,
    readonly: bool,
    controls: Controls,
    on_open: impl Fn(bool, &mut App) + 'static,
    trigger: Vec<AnyElement>,
    options: Vec<AnyElement>,
) -> impl IntoElement {
    let options = std::rc::Rc::new(std::cell::RefCell::new(Some(options)));
    Popover::new(id)
        .anchor(gpui_kit::Anchor::TopLeft)
        .open(open && !readonly)
        .on_open_change(move |open, _, cx| on_open(*open, cx))
        .trigger_style(gpui_kit::StyleRefinement::default().w_full())
        .trigger(
            ControlTrigger::new(
                SharedString::from(format!("{id}-trigger")),
                controls,
                readonly,
            )
            .full_width()
            .children(trigger),
        )
        .content(move |_, _, _| {
            v_flex()
                .min_w(px(220.))
                .children(options.borrow_mut().take().unwrap_or_default())
        })
}

/// "Join Google Meet" and the link under it (`ConferenceLink`).
fn join_link(url: String, label: &str, theme: &ResolvedTheme, controls: Controls) -> AnyElement {
    let open = url.clone();
    v_flex()
        .gap_1()
        .py_1()
        .child(
            Button::new("join-conference")
                .primary()
                .w_full()
                .icon(Icon::new(RenIcon::Video))
                .label(Role::Button.text(theme, &format!("Join {label}")))
                .on_click(move |_, _, cx| cx.open_url(&open)),
        )
        .child(
            div()
                .truncate()
                .text_size(controls.text_xs)
                .text_color(controls.muted)
                .child(url),
        )
        .into_any_element()
}

/// A read-only link row; only the text opens it (`UrlLink`).
fn url_link(url: String, hint: Option<&'static str>, controls: Controls) -> impl IntoElement {
    let open = url.clone();
    let text = controls.text;
    controls
        .row(SharedString::from(format!("link:{url}")), false, false)
        .group("url-link")
        .child(controls.leading(Some(RenIcon::Link)))
        .child(
            div().flex_1().min_w_0().child(
                div()
                    .id(SharedString::from(format!("link-text:{url}")))
                    .truncate()
                    .py_1()
                    .hover(move |style| style.underline().text_color(text))
                    .on_click(move |_, _, cx| cx.open_url(&to_openable_url(&open)))
                    .child(url),
            ),
        )
        .when_some(hint, |this, hint| {
            this.child(
                div()
                    .id(SharedString::from(format!("link-hint:{hint}")))
                    .invisible()
                    .group_hover("url-link", |style| style.visible())
                    .text_color(controls.muted)
                    .tooltip(move |window, cx| Tooltip::new(hint).build(window, cx))
                    .child(Icon::new(RenIcon::QuestionMarkCircle).size_4()),
            )
        })
}

/// RSVP: the Maybe / Decline / Accept bar for a pending invitation, else the
/// "My status" select (`RsvpBar`, `RsvpSelect`).
fn rsvp_field(event: &CalendarEvent, status: ResponseStatus, frame: &Frame) -> AnyElement {
    let answer = |id: &'static str, label: &'static str, response: ResponseStatus| {
        let event = event.clone();
        Button::new(id)
            .small()
            .label(Role::Button.text(frame.theme, label))
            .on_click(move |_, _, cx| commands::rsvp(&event, response, cx))
    };
    if status == ResponseStatus::NeedsAction {
        return h_flex()
            .justify_between()
            .gap_1p5()
            .child(answer("rsvp-maybe", "Maybe", ResponseStatus::Tentative).secondary())
            .child(
                h_flex()
                    .gap_1p5()
                    .child(answer("rsvp-decline", "Decline", ResponseStatus::Declined).secondary())
                    .child(answer("rsvp-accept", "Accept", ResponseStatus::Accepted).primary()),
            )
            .into_any_element();
    }
    let label = match status {
        ResponseStatus::Accepted => "Accepted",
        ResponseStatus::Declined => "Declined",
        ResponseStatus::Tentative => "Maybe",
        ResponseStatus::NeedsAction => "My status",
    };
    let theme = frame.theme;
    let event = event.clone();
    let controls = frame.controls;
    Button::new("rsvp-status")
        .ghost()
        .w_full()
        .child(
            h_flex()
                .w_full()
                .gap(controls.gap)
                .child(
                    controls
                        .leading(None)
                        .child(status_dot(Some(status), theme)),
                )
                .child(div().flex_1().text_left().child(label)),
        )
        .dropdown_menu(move |menu, _, _| {
            [
                ("Accepted", ResponseStatus::Accepted),
                ("Declined", ResponseStatus::Declined),
                ("Maybe", ResponseStatus::Tentative),
            ]
            .into_iter()
            .fold(menu, |menu, (label, response)| {
                let event = event.clone();
                menu.item(
                    PopupMenuItem::new(label)
                        .checked(response == status)
                        .on_click(move |_, _, cx| commands::rsvp(&event, response, cx)),
                )
            })
        })
        .into_any_element()
}

/// The "⋯" menu of an editable event: duplicate, delete.
fn overflow_menu(event: &CalendarEvent, cx: &mut Context<EventForm>) -> impl IntoElement {
    let theme = ThemeStore::active(cx);
    let event = event.clone();
    Button::new("event-more")
        .ghost()
        .xsmall()
        .icon(Icon::new(RenIcon::MoreHoriz).text_color(color(&theme, "text.muted")))
        .dropdown_menu_with_anchor(gpui_kit::Anchor::TopRight, move |menu, _, _| {
            let delete = event.clone();
            menu.menu("Duplicate event", Box::new(DuplicateEvent)).item(
                PopupMenuItem::new("Delete event").on_click(move |_, window, cx| {
                    commands::request_delete(delete.clone(), window, cx)
                }),
            )
        })
}
