//! `EventCommands` (GPUI_PORT_PLAN.md §3.3): every event write, ported from
//! `RecurrenceEditContext`, `DeleteEventContext`, `DuplicateEventContext`,
//! `lib/save-event.ts` and the RSVP calls.
//!
//! Writes are optimistic: `EventStore` changes at once, the backend write
//! runs on the blocking pool, and a failure puts the old events back with an
//! error toast. A success asks `SyncState` to sync. Recurring events first
//! ask which occurrences the command applies to (`dialogs`).

use chrono::{DateTime, Utc};
use gpui_kit::{App, Bounds, Pixels, Window};
use rencal_core::error::{CoreError, CoreErrorKind, CoreResult};
use rencal_core::state::AppState;
use rencal_text::conference::conference_for_calendar;
use rencal_text::recurrence::anchor_range_to_recurring_master;
use rencal_time::event::{Recurrence, ResponseStatus};
use rencal_time::{CalendarEvent, EventTimeRange};

use super::dialogs::{self, Scope, ScopePrompt};
use super::draft::DraftState;
use super::{can_create, prompt_to_connect, toast_error};
use crate::backend::{self, Backend, EventFields, EventKeyParts};
use crate::clock::Clock;
use crate::event_store::EventStore;
use crate::sync_state::SyncState;

/// Runs a backend write and hands its result to `done` on the main thread.
/// Without a backend (tests) nothing is written and `done` never runs.
fn write<R: Send + 'static>(
    cx: &mut App,
    op: impl FnOnce(&AppState) -> CoreResult<R> + Send + 'static,
    done: impl FnOnce(CoreResult<R>, &mut App) + 'static,
) {
    let Some(handle) = Backend::write(cx, op) else {
        return;
    };
    cx.spawn(async move |cx| {
        let result = handle
            .await
            .unwrap_or_else(|err| Err(CoreError::new(CoreErrorKind::Internal, err.to_string())));
        cx.update(|cx| done(result, cx));
    })
    .detach();
}

fn store_update<R>(
    cx: &mut App,
    f: impl FnOnce(&mut EventStore, &mut gpui_kit::Context<EventStore>) -> R,
) -> R {
    EventStore::global(cx).update(cx, f)
}

fn viewer(cx: &App) -> rencal_time::Tz {
    Clock::global(cx).viewer
}

// MARK: Save

/// Saves an edited event (`requestSave`). A recurring occurrence asks
/// whether the edit applies to it, the following ones or the whole series.
pub fn request_save(
    current: CalendarEvent,
    original: CalendarEvent,
    window: &mut Window,
    cx: &mut App,
) {
    if current.recurring_event_id.is_none() {
        update_and_sync(current, original, cx);
        return;
    }
    let calendars = EventStore::global(cx).read(cx).calendars().clone();
    let prompt = ScopePrompt {
        can_apply_to_future: current.is_user_organizer(&calendars),
        ..ScopePrompt::EDIT
    };
    dialogs::choose_scope(
        prompt,
        move |scope, _, cx| match scope {
            // update_event turns a synthetic occurrence id into an override
            // inheriting the master's fields.
            Scope::This => update_and_sync(current.clone(), original.clone(), cx),
            Scope::Future => apply_to_future(current.clone(), cx),
            Scope::All => apply_to_all(current.clone(), original.clone(), cx),
        },
        window,
        cx,
    );
}

/// Replaces `original` with `current` (`updateAndSyncEvent`).
pub fn update_and_sync(current: CalendarEvent, original: CalendarEvent, cx: &mut App) {
    // Keyed by the original identity: the edit may move it to another calendar.
    store_update(cx, |store, cx| {
        store.replace_event(&original.key(), current.clone(), cx)
    });
    let target = EventKeyParts::of(&original);
    let new_slug =
        (current.calendar_slug != original.calendar_slug).then(|| current.calendar_slug.clone());
    let fields = EventFields::of(&current);
    write(
        cx,
        move |state| backend::update_event(state, &target, new_slug, &fields),
        move |result, cx| match result {
            Ok(()) => SyncState::request(cx),
            Err(err) => {
                store_update(cx, |store, cx| {
                    store.replace_event(&current.key(), original, cx)
                });
                log::error!("update_event failed: {err}");
                toast_error("Failed to save event", err.message, cx);
            }
        },
    );
}

/// "This and future events": split the series at this occurrence; the new
/// master carries the edit.
fn apply_to_future(current: CalendarEvent, cx: &mut App) {
    let (Some(master_uid), Some(rule)) = (
        current.recurring_event_id.clone(),
        current.master_recurrence.clone(),
    ) else {
        return;
    };
    let viewer = viewer(cx);
    let slug = current.calendar_slug.clone();
    let range = EventTimeRange::new(current.start.clone(), current.end.clone());
    write(
        cx,
        move |state| backend::split_series(state, &slug, &master_uid, &range, Some(&rule), viewer),
        move |result, cx| match result {
            Ok(new_master) => {
                let updated = CalendarEvent {
                    summary: current.summary,
                    description: current.description,
                    location: current.location,
                    url: current.url,
                    reminders: current.reminders,
                    conference: current.conference,
                    ..new_master.clone()
                };
                update_and_sync(updated, new_master, cx);
            }
            Err(err) => {
                log::error!("recurring update failed: {err}");
                toast_error("Failed to save event", err.message, cx);
            }
        },
    );
}

/// "All events": apply the edit to the master, keeping its anchor date.
fn apply_to_all(current: CalendarEvent, original: CalendarEvent, cx: &mut App) {
    let Some(master_id) = current.recurring_event_id.clone() else {
        return;
    };
    let viewer = viewer(cx);
    let slug = original.calendar_slug.clone();
    write(
        cx,
        move |state| backend::get_event(state, &slug, &master_id, viewer),
        move |result, cx| match result {
            Ok(Some(master)) => {
                // The occurrence's edited range, moved to the master's anchor
                // date. This keeps date-only values when toggling all-day.
                let range = anchor_range_to_recurring_master(
                    &EventTimeRange::new(current.start.clone(), current.end.clone()),
                    &master.start,
                    viewer,
                );
                let moved = current.calendar_slug != master.calendar_slug;
                let updated = CalendarEvent {
                    summary: current.summary,
                    description: current.description,
                    location: current.location,
                    url: current.url,
                    start: range.start,
                    end: range.end,
                    reminders: current.reminders,
                    conference: current.conference,
                    calendar_slug: current.calendar_slug,
                    ..master.clone()
                }
                .with_viewer(viewer);
                update_and_sync(updated, master, cx);
                // Moving a series between calendars leaves its occurrences
                // behind in the loaded events.
                if moved {
                    store_update(cx, |store, cx| store.reload(cx));
                }
            }
            Ok(None) => {}
            Err(err) => {
                log::error!("recurring update failed: {err}");
                toast_error("Failed to save event", err.message, cx);
            }
        },
    );
}

// MARK: Delete

/// Asks before deleting (`triggerDelete`): which occurrences for a recurring
/// event, a plain confirmation otherwise.
pub fn request_delete(event: CalendarEvent, window: &mut Window, cx: &mut App) {
    let recurring = event.recurring_event_id.is_some() || event.recurrence.is_some();
    let summary = event.summary.clone();
    dialogs::confirm_delete(
        &summary,
        recurring,
        move |scope, _, cx| delete(scope, event.clone(), cx),
        window,
        cx,
    );
}

/// Deletes `event`, or its series from it on, or the whole series.
pub fn delete(scope: Scope, event: CalendarEvent, cx: &mut App) {
    match scope {
        Scope::This => delete_this(event, cx),
        Scope::Future => delete_future(event, cx),
        Scope::All => delete_all(event, cx),
    }
}

/// Drops the matching events at once and closes the open event. Returns the
/// removed events for a rollback.
fn remove_optimistically(
    matches: impl Fn(&CalendarEvent) -> bool,
    cx: &mut App,
) -> Vec<CalendarEvent> {
    store_update(cx, |store, cx| {
        let removed = store.remove_events(matches, cx);
        store.set_active_event(None, cx);
        removed
    })
}

fn delete_failed(removed: Vec<CalendarEvent>, procedure: &str, err: CoreError, cx: &mut App) {
    store_update(cx, |store, cx| store.insert_events(removed, cx));
    log::error!("{procedure} failed: {err}");
    toast_error("Failed to delete event", err.message, cx);
}

fn delete_this(event: CalendarEvent, cx: &mut App) {
    let key = event.key();
    let removed = remove_optimistically(|e| e.key() == key, cx);
    let target = EventKeyParts::of(&event);
    write(
        cx,
        move |state| backend::delete_event(state, &target),
        move |result, cx| match result {
            Ok(()) => SyncState::request(cx),
            Err(err) => delete_failed(removed, "delete_event", err, cx),
        },
    );
}

fn delete_all(event: CalendarEvent, cx: &mut App) {
    let parent = event
        .recurring_event_id
        .clone()
        .unwrap_or_else(|| event.id.clone());
    let slug = event.calendar_slug.clone();
    // The series only exists in this calendar; an identical series in another
    // calendar stays.
    let removed = remove_optimistically(
        {
            let (parent, slug) = (parent.clone(), slug.clone());
            move |e| {
                e.calendar_slug == slug
                    && (e.id == parent || e.recurring_event_id.as_ref() == Some(&parent))
            }
        },
        cx,
    );
    write(
        cx,
        move |state| backend::delete_series(state, &slug, &parent),
        move |result, cx| match result {
            Ok(()) => SyncState::request(cx),
            Err(err) => delete_failed(removed, "delete_recurring_series", err, cx),
        },
    );
}

fn delete_future(event: CalendarEvent, cx: &mut App) {
    // "This and future" on the master is the whole series.
    let Some(master_uid) = event.recurring_event_id.clone() else {
        delete_all(event, cx);
        return;
    };
    let viewer = viewer(cx);
    let slug = event.calendar_slug.clone();
    let master_id = master_uid.clone();
    write(
        cx,
        move |state| backend::get_event(state, &slug, &master_id, viewer),
        move |master, cx| {
            // So is the first occurrence: truncating before it would leave an
            // empty master behind. An unreadable master falls through to the
            // split, which reports the error.
            if let Ok(Some(master)) = &master
                && event.date_info.start_ms <= master.date_info.start_ms
            {
                delete_all(event, cx);
                return;
            }
            split_and_delete(event, master_uid, cx);
        },
    );
}

/// Deletes an occurrence and everything after it: split the series there
/// (truncating the original master and dropping later overrides), then
/// delete the new master the split created.
fn split_and_delete(event: CalendarEvent, master_uid: String, cx: &mut App) {
    let slug = event.calendar_slug.clone();
    let start_ms = event.date_info.start_ms;
    let removed = remove_optimistically(
        {
            let (slug, master_uid) = (slug.clone(), master_uid.clone());
            move |e| {
                e.calendar_slug == slug
                    && (e.id == master_uid || e.recurring_event_id.as_ref() == Some(&master_uid))
                    && e.date_info.start_ms >= start_ms
            }
        },
        cx,
    );
    let viewer = viewer(cx);
    let range = EventTimeRange::new(event.start.clone(), event.end.clone());
    write(
        cx,
        move |state| {
            let new_master =
                backend::split_series(state, &slug, &master_uid, &range, None, viewer)?;
            backend::delete_event(state, &EventKeyParts::of(&new_master))
        },
        move |result, cx| match result {
            Ok(()) => SyncState::request(cx),
            Err(err) => delete_failed(removed, "delete future events", err, cx),
        },
    );
}

// MARK: Duplicate

/// Opens the new-event draft prefilled with a copy (`triggerDuplicate`).
/// Saving goes through the normal create, so the copy gets a new UID. A
/// recurring event asks whether to copy the occurrence, the following ones
/// or the whole series.
pub fn request_duplicate(
    event: CalendarEvent,
    anchor: Option<Bounds<Pixels>>,
    window: &mut Window,
    cx: &mut App,
) {
    let calendars = EventStore::global(cx).read(cx).calendars().clone();
    if event.is_readonly(&calendars) {
        return;
    }
    if !can_create(cx) {
        prompt_to_connect(cx);
        return;
    }
    if event.recurring_event_id.is_none() && event.recurrence.is_none() {
        open_duplicate(&event, None, anchor, cx);
        return;
    }
    dialogs::choose_scope(
        ScopePrompt::DUPLICATE,
        move |scope, _, cx| match scope {
            // A single occurrence becomes a standalone event.
            Scope::This => open_duplicate(&event, None, anchor, cx),
            // A new series from this occurrence with the same rule; the
            // original series is untouched.
            Scope::Future => {
                let rule = event
                    .master_recurrence
                    .clone()
                    .or_else(|| event.recurrence.clone());
                open_duplicate(&event, rule, anchor, cx);
            }
            Scope::All => duplicate_series(event.clone(), anchor, cx),
        },
        window,
        cx,
    );
}

/// Copies the whole series from its master, so the anchor date and rule
/// stay intact.
fn duplicate_series(event: CalendarEvent, anchor: Option<Bounds<Pixels>>, cx: &mut App) {
    let fallback = event
        .recurrence
        .clone()
        .or_else(|| event.master_recurrence.clone());
    let Some(master_id) = event.recurring_event_id.clone() else {
        open_duplicate(&event, fallback, anchor, cx);
        return;
    };
    let viewer = viewer(cx);
    let slug = event.calendar_slug.clone();
    write(
        cx,
        move |state| backend::get_event(state, &slug, &master_id, viewer),
        move |result, cx| match result {
            Ok(Some(master)) => {
                let rule = master
                    .recurrence
                    .clone()
                    .or_else(|| master.master_recurrence.clone())
                    .or_else(|| event.master_recurrence.clone());
                open_duplicate(&master, rule, anchor, cx);
            }
            other => {
                if let Err(err) = other {
                    log::error!("get_event (duplicate master) failed: {err}");
                }
                open_duplicate(&event, fallback, anchor, cx);
            }
        },
    );
}

fn open_duplicate(
    source: &CalendarEvent,
    recurrence: Option<Recurrence>,
    anchor: Option<Bounds<Pixels>>,
    cx: &mut App,
) {
    let store = EventStore::global(cx).read(cx);
    let writable = |slug: &str| {
        store
            .calendar(slug)
            .is_some_and(|calendar| calendar.read_only != Some(true))
    };
    let target = if writable(&source.calendar_slug) {
        Some(source.calendar_slug.clone())
    } else {
        DraftState::default_calendar_id(cx)
    };
    let Some(target) = target else {
        prompt_to_connect(cx);
        return;
    };
    let calendar = store.calendar(&target).cloned();
    let draft = CalendarEvent {
        recurrence,
        attendees: source.attendees.clone(),
        conference: conference_for_calendar(source.conference.clone(), calendar.as_ref()),
        calendar_slug: target,
        ..DraftState::blank_draft(source.start.clone(), source.end.clone())
    };
    let draft = CalendarEvent {
        summary: source.summary.clone(),
        description: source.description.clone(),
        location: source.location.clone(),
        url: source.url.clone(),
        ..draft
    };
    let reminders = source.reminders.clone();
    DraftState::open_popover(draft, Some(reminders), anchor, cx);
}

// MARK: RSVP

/// Answers an invitation and closes the open event.
pub fn rsvp(event: &CalendarEvent, response: ResponseStatus, cx: &mut App) {
    let target = EventKeyParts::of(event);
    write(
        cx,
        move |state| backend::rsvp(state, &target, response),
        |result, cx| match result {
            Ok(()) => {
                SyncState::request(cx);
                store_update(cx, |store, cx| store.set_active_event(None, cx));
            }
            Err(err) => {
                log::error!("rsvp failed: {err}");
                toast_error("Failed to respond to invite", err.message, cx);
            }
        },
    );
}

// MARK: Create

/// Creates the draft (`createDraftEvent`): shown at once with a temporary
/// id, swapped for the stored event when the write lands.
pub fn create(draft: CalendarEvent, cx: &mut App) {
    if draft.calendar_slug.is_empty() {
        return;
    }
    let viewer = viewer(cx);
    let optimistic = CalendarEvent {
        id: optimistic_id(Clock::global(cx).now),
        ..draft.clone()
    }
    .with_viewer(viewer);
    let optimistic_key = optimistic.key();
    store_update(cx, |store, cx| store.insert_events(vec![optimistic], cx));
    log::info!("create event: {}", draft.summary);

    let slug = draft.calendar_slug.clone();
    let recurring = draft.recurrence.is_some();
    let fields = EventFields::of(&draft);
    write(
        cx,
        move |state| backend::create_event(state, &slug, &fields, viewer),
        move |result, cx| {
            match result {
                // create_event returns only the master: reload so the series
                // expands into occurrences (replacing the optimistic row).
                Ok(_) if recurring => store_update(cx, |store, cx| store.reload(cx)),
                Ok(created) => store_update(cx, |store, cx| {
                    store.reconcile_create(&optimistic_key, created, cx)
                }),
                Err(err) => {
                    store_update(cx, |store, cx| store.rollback_create(&optimistic_key, cx));
                    log::error!("create_event failed: {err}");
                    toast_error("Failed to create event", err.message, cx);
                    return;
                }
            }
            SyncState::request(cx);
        },
    );
}

/// A unique stand-in id until the backend assigns one.
fn optimistic_id(now: DateTime<Utc>) -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    format!(
        "optimistic-{}-{}",
        now.timestamp_millis(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}
