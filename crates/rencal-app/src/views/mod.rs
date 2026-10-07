//! The calendar views (GPUI_PORT_PLAN.md §3.4, §6.1). The registry is open:
//! views are looked up by the string id `UiState::calendar_view` stores, so a
//! plugin view can slot in later without a closed enum.

pub mod axis;
pub mod board;
pub mod month;
pub mod week;

use gpui_kit::{
    Action, AnyView, App, AppContext, Bounds, IntoElement, Pixels, Styled, WeakEntity, Window,
    canvas,
};

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

#[cfg(test)]
mod tests;
