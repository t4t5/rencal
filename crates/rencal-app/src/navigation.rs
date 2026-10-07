//! The `Navigation` global (GPUI_PORT_PLAN.md §3.3, port of the navigation
//! half of `CalendarStateContext`): the active date and deliberate jumps.
//!
//! Two ways to change the active date, as in `src/AGENTS.md` → Navigation:
//! - `navigate_to` is a deliberate jump (`t`, `hjkl`, a minical or day click).
//!   It bumps `version`, so every view rechecks whether the date is in view
//!   even when it didn't change ("t brings today back"), and marks a short
//!   navigating window during which scroll observers leave the date alone.
//! - `set_active_date` only changes the date (the agenda following its scroll,
//!   keyboard focus in the agenda). Views don't scroll for it.
//!
//! Views keep their own scroll position; see `docs/scroll-behaviour.md`.

use std::time::{Duration, Instant};

use chrono::NaiveDate;
use gpui_kit::{App, BorrowAppContext, Global};
use rencal_time::event::start_range_for_date;

use crate::clock::Clock;
use crate::event_store::EventStore;

/// How long after a jump scroll observers treat scrolling as programmatic.
const NAVIGATION_WINDOW: Duration = Duration::from_millis(500);
/// Jumps closer together than this scroll instantly instead of animating.
const RAPID_NAVIGATION: Duration = Duration::from_millis(200);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ScrollBehavior {
    Smooth,
    Instant,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Navigation {
    pub active_date: NaiveDate,
    /// Bumped by every deliberate jump.
    pub version: u64,
    /// How the latest jump wants views to scroll.
    pub behavior: ScrollBehavior,
    navigating_until: Option<Instant>,
    last_jump: Option<Instant>,
}

impl Global for Navigation {}

impl Navigation {
    pub fn global(cx: &App) -> &Self {
        cx.global::<Self>()
    }

    pub fn active_date(cx: &App) -> NaiveDate {
        Self::global(cx).active_date
    }

    /// Starts on today. `Clock` must be set.
    pub fn init(cx: &mut App) {
        cx.set_global(Self {
            active_date: Clock::global(cx).today,
            version: 0,
            behavior: ScrollBehavior::Instant,
            navigating_until: None,
            last_jump: None,
        });
    }

    /// A deliberate jump to `date` (see the module docs). Loads the date's
    /// events in the background; views never wait for them.
    pub fn navigate_to(date: NaiveDate, behavior: Option<ScrollBehavior>, cx: &mut App) {
        let now = Instant::now();
        let mut next = Self::global(cx).clone();
        let rapid = next
            .last_jump
            .is_some_and(|last| now.duration_since(last) < RAPID_NAVIGATION);
        next.behavior = behavior.unwrap_or(if rapid {
            ScrollBehavior::Instant
        } else {
            ScrollBehavior::Smooth
        });
        next.last_jump = Some(now);
        next.navigating_until = Some(now + NAVIGATION_WINDOW);
        next.active_date = date;
        next.version += 1;
        cx.set_global(next);

        let range = start_range_for_date(date);
        EventStore::ensure_loaded(range.start, range.end, cx);
    }

    /// Changes the active date without a jump.
    pub fn set_active_date(date: NaiveDate, cx: &mut App) {
        if Self::global(cx).active_date != date {
            cx.update_global::<Self, _>(|nav, _| nav.active_date = date);
        }
    }

    /// Whether a jump (or another programmatic scroll that called
    /// `set_navigating`) is still settling.
    pub fn is_navigating(cx: &App) -> bool {
        Self::global(cx)
            .navigating_until
            .is_some_and(|until| Instant::now() < until)
    }

    /// Marks (or clears) a programmatic scroll outside `navigate_to`.
    pub fn set_navigating(navigating: bool, cx: &mut App) {
        let until = navigating.then(|| Instant::now() + NAVIGATION_WINDOW);
        cx.update_global::<Self, _>(|nav, _| nav.navigating_until = until);
    }
}
