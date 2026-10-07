//! The calendar views (GPUI_PORT_PLAN.md §3.4, §6.1). The registry is open:
//! views are looked up by the string id `UiState::calendar_view` stores, so a
//! plugin view can slot in later without a closed enum.

pub mod axis;
pub mod board;
pub mod interact;
pub mod month;
pub mod week;

use std::sync::Arc;

use gpui_kit::{
    Action, AnyView, App, AppContext, Bounds, BoxShadow, Hsla, IntoElement, Pixels, Styled,
    WeakEntity, Window, canvas, point, px,
};
use rencal_layout::drag::day_selection_range;
use rencal_time::{CalendarEvent, EventKey};

use crate::clock::Clock;
use crate::editing::draft::DraftState;
use crate::editing::drag::{DragOverlay, DragState};
use crate::event_store::EventStore;
use crate::keymap::{ShowBoardView, ShowMonthView, ShowWeekView};

pub struct ViewDef {
    pub id: &'static str,
    pub name: &'static str,
    pub action: fn() -> Box<dyn Action>,
    build: fn(&mut Window, &mut App) -> AnyView,
}

/// The views, in menu order.
pub static VIEWS: &[ViewDef] = &[
    ViewDef {
        id: "week",
        name: "Week",
        action: || Box::new(ShowWeekView),
        build: |window, cx| cx.new(|cx| week::WeekView::new(window, cx)).into(),
    },
    ViewDef {
        id: "month",
        name: "Month",
        action: || Box::new(ShowMonthView),
        build: |window, cx| cx.new(|cx| month::MonthView::new(window, cx)).into(),
    },
    ViewDef {
        id: "board",
        name: "Board",
        action: || Box::new(ShowBoardView),
        build: |window, cx| cx.new(|cx| board::BoardView::new(window, cx)).into(),
    },
];

/// The view shown for an unknown id.
pub const DEFAULT_VIEW: &str = "month";

pub fn view_def(id: &str) -> &'static ViewDef {
    VIEWS
        .iter()
        .find(|view| view.id == id)
        .or_else(|| VIEWS.iter().find(|view| view.id == DEFAULT_VIEW))
        .expect("the default view is registered")
}

pub fn build(id: &str, window: &mut Window, cx: &mut App) -> AnyView {
    (view_def(id).build)(window, cx)
}

/// An invisible element filling its (relative) parent that reports the
/// parent's bounds to `view` after layout. `set` returns whether they
/// changed, which re-renders the view: a view sizes its content from the
/// previous frame's bounds.
pub fn measure<V: 'static>(
    view: WeakEntity<V>,
    set: fn(&mut V, Bounds<Pixels>) -> bool,
) -> impl IntoElement {
    canvas(
        move |bounds, _, cx| {
            view.update(cx, |view, cx| {
                if set(view, bounds) {
                    cx.notify();
                }
            })
            .ok();
        },
        |_, _, _, _| {},
    )
    .absolute()
    .size_full()
}

/// What a view lays out: the loaded events plus the stand-ins of editing
/// (the draft, a drag preview, a month create selection), appended so they
/// take their natural lanes and slots (`useEventsWithDraft`,
/// `useEventsWithDrag`).
#[derive(Clone)]
pub struct ViewEvents {
    pub events: Arc<Vec<CalendarEvent>>,
    /// Changes whenever `events` or the roles do; cache layouts on it.
    pub revision: (u64, u64, u64),
    pub draft: Option<usize>,
    pub preview: Option<usize>,
    pub selection: Option<usize>,
    /// The dragged event's own block (drawn dimmed).
    pub source: Option<EventKey>,
    /// Composing in the sidebar fades the other events.
    pub dimmed: bool,
    pub overlay: DragOverlay,
}

/// How a laid-out event is drawn.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventRole {
    Normal,
    Draft,
    Preview,
    /// A drag-to-create selection (flat tint).
    Selection,
}

impl EventRole {
    /// Stand-ins take no clicks, menus or drags.
    pub fn is_static(self) -> bool {
        self != Self::Normal
    }
}

pub const CREATE_SELECTION_ID: &str = "__create-selection";

/// A ring around a block (a ring rather than a border keeps the fill flush
/// with the grid lines).
pub fn ring(color: Hsla, width: f32) -> Vec<BoxShadow> {
    vec![BoxShadow {
        color,
        offset: point(px(0.), px(0.)),
        blur_radius: px(0.),
        spread_radius: px(width),
        inset: false,
    }]
}

impl ViewEvents {
    /// `day_selection`: include the month grid's create selection.
    pub fn read(day_selection: bool, cx: &App) -> Self {
        let store = EventStore::global(cx).read(cx);
        let draft_state = DraftState::read(cx);
        let overlay = DragState::overlay(cx);
        let viewer = Clock::global(cx).viewer;
        let base = store.events().clone();
        let draft = draft_state.view_draft().cloned();
        let selection = day_selection
            .then_some(overlay.day_selection)
            .flatten()
            .map(|selection| {
                let range = day_selection_range(&selection);
                let mut event = DraftState::blank_draft(range.start, range.end);
                event.id = CREATE_SELECTION_ID.into();
                event.calendar_slug = DraftState::default_calendar_id(cx).unwrap_or_default();
                event.with_viewer(viewer)
            });
        let extras: Vec<(CalendarEvent, EventRole)> = [
            draft.map(|d| (d, EventRole::Draft)),
            overlay.preview.clone().map(|p| (p, EventRole::Preview)),
            selection.map(|s| (s, EventRole::Selection)),
        ]
        .into_iter()
        .flatten()
        .collect();
        let mut view = Self {
            revision: (
                store.revision(),
                draft_state.revision(),
                DragState::revision(cx),
            ),
            draft: None,
            preview: None,
            selection: None,
            source: overlay.source.clone(),
            dimmed: draft_state.is_dimmed(),
            overlay,
            events: base,
        };
        if extras.is_empty() {
            return view;
        }
        let mut events = (*view.events).clone();
        for (event, role) in extras {
            let index = events.len();
            events.push(event);
            match role {
                EventRole::Draft => view.draft = Some(index),
                EventRole::Preview => view.preview = Some(index),
                EventRole::Selection => view.selection = Some(index),
                EventRole::Normal => {}
            }
        }
        view.events = Arc::new(events);
        view
    }

    pub fn role(&self, index: usize) -> EventRole {
        if Some(index) == self.draft {
            EventRole::Draft
        } else if Some(index) == self.preview {
            EventRole::Preview
        } else if Some(index) == self.selection {
            EventRole::Selection
        } else {
            EventRole::Normal
        }
    }

    /// The opacity a block of `role` is drawn at: the drag source and, while
    /// composing, every real event fade.
    pub fn opacity(&self, event: &CalendarEvent, role: EventRole) -> f32 {
        if role == EventRole::Normal && self.source.as_ref() == Some(&event.key()) {
            0.4
        } else if role == EventRole::Normal && self.dimmed {
            0.5
        } else {
            1.0
        }
    }
}

#[cfg(test)]
mod tests;
