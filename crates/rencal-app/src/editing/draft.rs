//! `DraftState` (GPUI_PORT_PLAN.md §3.3, port of `EventDraftContext`,
//! `CreateEventGateContext` and `useOpenDayDraft`): the new event being made.
//!
//! A draft comes from one of two places, never both at once:
//! - Composing (`c`): the sidebar input. Its text runs through the magic
//!   parser 300 ms after the last keystroke; until a time, rule or location
//!   is recognised the whole text is the summary. While composing, a new
//!   start date scrolls the calendar to it.
//! - The new-event popover: opened on a day (context menu, double click,
//!   drag to create, `a`) or by duplicating an event, at an anchor.
//!
//! The draft is a `CalendarEvent` with the id `DRAFT_ID` (its reminders are
//! the draft's reminders; an empty `calendar_slug` means no writable
//! calendar), so the editor and the views treat it like any event.

use std::time::Duration;

use chrono::{Duration as Days, NaiveDate, Timelike};
use gpui_kit::{
    App, AppContext, Bounds, Context, Entity, Global, Pixels, Subscription, Task, point, px, size,
};
use rencal_text::magic::parse_event_text;
use rencal_time::constants::DEFAULT_DURATION_MINS;
use rencal_time::event::EventStatus;
use rencal_time::{CalendarEvent, EventTime, at_time};

use super::{can_create, commands, prompt_to_connect};
use crate::clock::Clock;
use crate::event_store::EventStore;
use crate::navigation::Navigation;
use crate::settings::Settings;

pub const DRAFT_ID: &str = "__draft";
const PARSE_DEBOUNCE: Duration = Duration::from_millis(300);

/// How `open_day_draft` fills the draft.
#[derive(Clone, Debug, Default)]
pub struct DayDraft {
    pub all_day: bool,
    /// Defaults to the day (all-day) or the current hour on the day.
    pub start: Option<EventTime>,
    /// Defaults to a day / an hour after `start`.
    pub end: Option<EventTime>,
    /// Anchor the popover at this window y instead of the anchor's middle.
    pub anchor_y: Option<Pixels>,
}

pub struct DraftState {
    composing: bool,
    popover_open: bool,
    /// Where the popover anchors, in window coordinates.
    anchor: Option<Bounds<Pixels>>,
    draft: CalendarEvent,
    text: String,
    /// Once the parser has found a time, rule or location, typing no longer
    /// overwrites the summary directly.
    parsed_something: bool,
    parse: Option<Task<()>>,
    /// The draft's start date the calendar was last scrolled to while
    /// composing.
    jumped_to: Option<NaiveDate>,
    /// Bumps with every change the views draw.
    revision: u64,
    _subscriptions: Vec<Subscription>,
}

struct DraftStateHandle(Entity<DraftState>);

impl Global for DraftStateHandle {}

impl DraftState {
    pub fn init(cx: &mut App) {
        let state = cx.new(|cx| {
            let store = EventStore::global(cx);
            let draft = Self::default_draft(cx);
            Self {
                composing: false,
                popover_open: false,
                anchor: None,
                draft,
                text: String::new(),
                parsed_something: false,
                parse: None,
                jumped_to: None,
                revision: 0,
                // Opening an event closes the new-event popover.
                _subscriptions: vec![cx.observe(&store, |this: &mut Self, store, cx| {
                    if this.popover_open && store.read(cx).active_event().is_some() {
                        this.close_popover(cx);
                    }
                })],
            }
        });
        cx.set_global(DraftStateHandle(state));
    }

    pub fn global(cx: &App) -> Entity<Self> {
        cx.global::<DraftStateHandle>().0.clone()
    }

    pub fn read(cx: &App) -> &Self {
        cx.global::<DraftStateHandle>().0.read(cx)
    }

    pub fn is_composing(&self) -> bool {
        self.composing
    }

    pub fn is_popover_open(&self) -> bool {
        self.popover_open
    }

    pub fn anchor(&self) -> Option<Bounds<Pixels>> {
        self.anchor
    }

    pub fn draft(&self) -> &CalendarEvent {
        &self.draft
    }

    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn revision(&self) -> u64 {
        self.revision
    }

    /// Composing with text: the views fade so the draft stands out.
    pub fn is_dimmed(&self) -> bool {
        self.composing && !self.text.is_empty()
    }

    /// The draft as the views draw it, if they draw one.
    pub fn view_draft(&self) -> Option<&CalendarEvent> {
        let shown = self.popover_open || self.is_dimmed();
        (shown && !self.draft.calendar_slug.is_empty()).then_some(&self.draft)
    }

    fn changed(&mut self, cx: &mut Context<Self>) {
        self.revision += 1;
        cx.notify();
    }

    /// The configured default calendar if it's writable, else the first
    /// writable one.
    pub fn default_calendar_id(cx: &App) -> Option<String> {
        let store = EventStore::global(cx).read(cx);
        let writable = |slug: &str| {
            store
                .calendar(slug)
                .is_some_and(|calendar| calendar.read_only != Some(true))
        };
        Settings::global(cx)
            .caldir
            .default_calendar
            .clone()
            .filter(|slug| writable(slug))
            .or_else(|| {
                store
                    .calendars()
                    .iter()
                    .find(|calendar| calendar.read_only != Some(true))
                    .map(|calendar| calendar.slug.clone())
            })
    }

    fn default_reminders(cx: &App) -> Vec<i32> {
        Settings::global(cx).caldir.default_reminders.clone()
    }

    /// An empty draft over `[start, end)` with no calendar.
    pub fn blank_draft(start: EventTime, end: EventTime) -> CalendarEvent {
        CalendarEvent {
            id: DRAFT_ID.into(),
            recurring_event_id: None,
            summary: String::new(),
            description: None,
            location: None,
            url: None,
            start,
            end,
            status: EventStatus::Confirmed,
            recurrence: None,
            master_recurrence: None,
            reminders: Vec::new(),
            organizer: None,
            attendees: Vec::new(),
            conference: None,
            calendar_slug: String::new(),
            color: None,
            updated: None,
            date_info: Default::default(),
        }
    }

    /// The next whole hour in the viewer's zone, for an hour, in the default
    /// calendar.
    fn default_draft(cx: &App) -> CalendarEvent {
        let clock = Clock::global(cx);
        let next = clock.now.with_timezone(&clock.viewer) + Days::hours(1);
        let start = at_time(next.date_naive(), next.hour(), 0, clock.viewer);
        let end = start.add_minutes(i64::from(DEFAULT_DURATION_MINS));
        let mut draft = Self::blank_draft(start, end);
        draft.calendar_slug = Self::default_calendar_id(cx).unwrap_or_default();
        draft.reminders = Self::default_reminders(cx);
        draft.with_viewer(clock.viewer)
    }

    /// Back to an empty draft (`setDefaultDraftEvent`).
    fn reset(&mut self, cx: &mut Context<Self>) {
        self.parse = None;
        self.parsed_something = false;
        self.draft = Self::default_draft(cx);
        self.changed(cx);
    }

    // MARK: Editing the draft

    /// Applies an edit from the editor.
    pub fn update_draft(&mut self, edit: impl FnOnce(&mut CalendarEvent), cx: &mut Context<Self>) {
        let mut draft = self.draft.clone();
        edit(&mut draft);
        draft.refresh_date_info(Clock::global(cx).viewer);
        if draft != self.draft {
            self.draft = draft;
            self.changed(cx);
        }
    }

    // MARK: Composing

    /// `c` and the compose button: start an empty draft in the sidebar.
    pub fn start_composing(cx: &mut App) {
        if !can_create(cx) {
            prompt_to_connect(cx);
            return;
        }
        Self::global(cx).update(cx, |this, cx| {
            this.reset(cx);
            this.composing = true;
            this.jumped_to = Some(
                this.draft
                    .start
                    .date_in_viewer_zone(Clock::global(cx).viewer),
            );
            this.changed(cx);
        });
    }

    pub fn stop_composing(&mut self, cx: &mut Context<Self>) {
        if self.composing {
            self.composing = false;
            self.jumped_to = None;
            self.changed(cx);
        }
    }

    /// The compose input's text (`setText`).
    pub fn set_text(&mut self, text: String, cx: &mut Context<Self>) {
        if text == self.text {
            return;
        }
        if !self.parsed_something {
            self.draft.summary = text.clone();
        }
        self.text = text;
        self.changed(cx);
        self.parse = Some(cx.spawn(async move |this, cx| {
            cx.background_executor().timer(PARSE_DEBOUNCE).await;
            this.update(cx, |this, cx| this.apply_parse(cx)).ok();
        }));
    }

    fn apply_parse(&mut self, cx: &mut Context<Self>) {
        self.parse = None;
        let clock = Clock::global(cx);
        let viewer = clock.viewer;
        let now = clock.now.with_timezone(&viewer).naive_local();
        let parsed = parse_event_text(&self.text, now, viewer);
        self.parsed_something =
            parsed.time.is_some() || parsed.recurrence.is_some() || parsed.location.is_some();
        self.draft.summary = parsed.summary;
        self.draft.recurrence = parsed.recurrence;
        self.draft.location = parsed.location;
        if let Some(time) = parsed.time {
            self.draft.set_dates(time.start, time.end, viewer);
        }
        self.changed(cx);

        // Scroll to the day the event is being created for.
        let date = self.draft.start.date_in_viewer_zone(viewer);
        if self.composing && self.jumped_to != Some(date) {
            self.jumped_to = Some(date);
            cx.defer(move |cx| Navigation::navigate_to(date, None, cx));
        }
    }

    /// Runs a pending parse now (Enter before the debounce fired).
    pub fn flush_parse(&mut self, cx: &mut Context<Self>) {
        if self.parse.is_some() {
            self.apply_parse(cx);
        }
    }

    /// Creates the draft and starts over with an empty one.
    pub fn create(&mut self, cx: &mut Context<Self>) {
        let draft = self.draft.clone();
        self.reset(cx);
        self.text.clear();
        cx.defer(move |cx| commands::create(draft, cx));
    }

    // MARK: The popover

    /// Opens the new-event popover with `draft`, anchored at `anchor`.
    /// `reminders` defaults to the configured ones.
    pub fn open_popover(
        mut draft: CalendarEvent,
        reminders: Option<Vec<i32>>,
        anchor: Option<Bounds<Pixels>>,
        cx: &mut App,
    ) {
        EventStore::global(cx).update(cx, |store, cx| store.set_active_event(None, cx));
        draft.id = DRAFT_ID.into();
        draft.reminders = reminders.unwrap_or_else(|| Self::default_reminders(cx));
        let viewer = Clock::global(cx).viewer;
        Self::global(cx).update(cx, |this, cx| {
            this.parse = None;
            this.composing = false;
            this.jumped_to = None;
            this.draft = draft.with_viewer(viewer);
            this.anchor = anchor;
            this.popover_open = true;
            this.changed(cx);
        });
    }

    pub fn close_popover(&mut self, cx: &mut Context<Self>) {
        if self.popover_open {
            self.popover_open = false;
            self.anchor = None;
            self.reset(cx);
        }
    }

    /// Opens the new-event popover for `day` (`useOpenDayDraft`).
    pub fn open_day_draft(
        day: NaiveDate,
        anchor: Option<Bounds<Pixels>>,
        opts: DayDraft,
        cx: &mut App,
    ) {
        if !can_create(cx) {
            prompt_to_connect(cx);
            return;
        }
        let clock = *Clock::global(cx);
        let viewer = clock.viewer;
        let (start, end) = if opts.all_day {
            let start = opts.start.unwrap_or(EventTime::Date(day));
            let end = opts.end.unwrap_or_else(|| start.add_days(1));
            (start, end)
        } else {
            let start = match opts.start {
                Some(start) => start.with_viewer_zone(viewer),
                None => at_time(day, clock.now.with_timezone(&viewer).hour(), 0, viewer),
            };
            let end = match opts.end {
                Some(end) => end.with_viewer_zone(viewer),
                None => start.add_minutes(i64::from(DEFAULT_DURATION_MINS)),
            };
            (start, end)
        };
        let mut draft = Self::blank_draft(start, end);
        draft.calendar_slug = Self::default_calendar_id(cx).unwrap_or_default();
        let anchor = match (anchor, opts.anchor_y) {
            (Some(anchor), Some(y)) => Some(Bounds::new(
                point(anchor.origin.x, y),
                size(anchor.size.width, px(0.)),
            )),
            (anchor, _) => anchor,
        };
        Self::open_popover(draft, None, anchor, cx);
    }
}

/// The end of `date`'s last timed event (`getLastEventEndTime`): a new event
/// on the day follows the day's events. An end past midnight falls back to
/// 08:00 on the day. `None` when the day has no timed events.
pub fn last_event_end(
    date: NaiveDate,
    events: &[CalendarEvent],
    viewer: rencal_time::Tz,
) -> Option<EventTime> {
    let day = rencal_time::epoch_day(date);
    let last = events
        .iter()
        .filter(|e| !e.is_spanning() && e.date_info.first_day == day)
        .max_by_key(|e| e.date_info.start_ms)?;
    Some(if last.date_info.end_day == day {
        last.end.clone()
    } else {
        at_time(date, 8, 0, viewer)
    })
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use gpui_kit::TestAppContext;
    use rencal_config::ThemeConfig;
    use rencal_time::Calendar;

    use super::*;
    use crate::test_support;

    fn init(cx: &mut TestAppContext) {
        cx.update(|cx| {
            test_support::init(ThemeConfig::default(), None, cx);
            EventStore::global(cx).update(cx, |store, cx| {
                store.set_calendars(
                    vec![Calendar {
                        slug: "work".into(),
                        name: Some("Work".into()),
                        color: None,
                        provider: None,
                        account: None,
                        read_only: None,
                    }],
                    cx,
                )
            });
        });
    }

    fn state(cx: &mut TestAppContext) -> (CalendarEvent, String, bool) {
        cx.update(|cx| {
            let state = DraftState::read(cx);
            (
                state.draft().clone(),
                state.text().to_owned(),
                state.is_dimmed(),
            )
        })
    }

    #[gpui_kit::test]
    fn composing_parses_the_text_after_a_pause(cx: &mut TestAppContext) {
        init(cx);
        cx.update(DraftState::start_composing);
        let (draft, ..) = state(cx);
        // The next whole hour after the frozen 10:00 UTC, in the default calendar.
        assert_eq!(draft.calendar_slug, "work");
        assert_eq!(draft.date_info.start_local_minutes, 11 * 60);

        cx.update(|cx| {
            DraftState::global(cx).update(cx, |state, cx| {
                state.set_text("Lunch tomorrow at 1pm".into(), cx)
            })
        });
        let (draft, text, dimmed) = state(cx);
        assert_eq!(draft.summary, "Lunch tomorrow at 1pm");
        assert_eq!(text, "Lunch tomorrow at 1pm");
        assert!(dimmed);

        cx.executor().advance_clock(Duration::from_millis(350));
        cx.run_until_parked();
        let (draft, ..) = state(cx);
        assert_eq!(draft.summary, "Lunch");
        assert_eq!(draft.date_info.start_local_minutes, 13 * 60);
        assert_eq!(
            draft.start.date_in_viewer_zone(chrono_tz::UTC),
            "2026-10-08".parse::<NaiveDate>().unwrap()
        );
        // The calendar follows the new start date.
        assert_eq!(
            cx.update(|cx| Navigation::active_date(cx)),
            "2026-10-08".parse::<NaiveDate>().unwrap()
        );
    }

    #[gpui_kit::test]
    fn day_drafts_open_the_popover_and_close_with_an_open_event(cx: &mut TestAppContext) {
        init(cx);
        let day = "2026-10-09".parse().unwrap();
        cx.update(|cx| DraftState::open_day_draft(day, None, DayDraft::default(), cx));
        cx.update(|cx| {
            let state = DraftState::read(cx);
            assert!(state.is_popover_open());
            // The current hour on that day.
            assert_eq!(state.draft().date_info.start_local_minutes, 10 * 60);
            assert_eq!(state.view_draft().map(|d| d.id.as_str()), Some(DRAFT_ID));
        });
        cx.update(|cx| {
            EventStore::global(cx).update(cx, |store, cx| {
                store.set_active_event(Some(rencal_time::event_key("work", "x")), cx)
            })
        });
        cx.update(|cx| assert!(!DraftState::read(cx).is_popover_open()));
    }
}
