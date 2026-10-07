//! `EventStore` (GPUI_PORT_PLAN.md §3.3): the calendars, the events loaded
//! for them, and which event is open or selected. Port of
//! `CalEventsContext`, the calendars half of `CalendarStateContext`,
//! `useVisibleCalendarIds` and the invites fetch of `InvitesBadge`.
//!
//! Loading is range-based and best-effort: views call `ensure_loaded` with
//! the days they show and never wait for the result (docs/scroll-behaviour.md).
//! All loads go through one serialized worker, so the views, the agenda and
//! jumps can't race:
//! - `desired` is the range wanted (it only grows); `covered` is what
//!   `events` actually holds. The worker reconciles `covered` up to `desired`,
//!   fetching only the missing slices.
//! - A forced reload (calendars toggled, caldir changed on disk) refetches the
//!   whole desired range. A load whose inputs changed while it was in flight
//!   (selection, a widened range, another reload) is redone rather than
//!   applied.
//!
//! `revision` bumps whenever `events` changes, so views can cache layouts.

use std::sync::Arc;

use chrono::NaiveDate;
use gpui_kit::{App, AppContext, AsyncApp, Context, Entity, Global, Subscription, WeakEntity};
use rencal_core::error::CoreResult;
use rencal_text::calendar_groups::visible_calendar_slugs;
use rencal_time::event::{
    DateRange, MergePosition, merge_events, reconcile_optimistic_create,
    rollback_optimistic_create, start_range_for_date,
};
use rencal_time::{Calendar, CalendarEvent, EventKey, Tz};
use tokio::task::JoinHandle;

use crate::backend::{self, Backend};
use crate::clock::Clock;
use crate::navigation::Navigation;
use crate::settings::Settings;
use crate::ui_state::UiState;
use crate::watchers::CaldirRevision;

pub struct EventStore {
    calendars: Arc<Vec<Calendar>>,
    calendars_loaded: bool,
    events: Arc<Vec<CalendarEvent>>,
    revision: u64,
    /// Slugs of the calendars the active group shows.
    visible: Vec<String>,
    desired: Option<DateRange>,
    covered: Option<DateRange>,
    syncing: bool,
    pending_force: bool,
    initial_loading: bool,
    /// The open event (clicked, or opened from the agenda).
    active_event: Option<EventKey>,
    /// The agenda row under keyboard focus.
    selected_event: Option<EventKey>,
    invites: Arc<Vec<CalendarEvent>>,
    viewer: Tz,
    caldir_revision: CaldirRevision,
    _subscriptions: Vec<Subscription>,
}

struct EventStoreHandle(Entity<EventStore>);

impl Global for EventStoreHandle {}

impl EventStore {
    /// Creates the store and starts loading calendars. `Settings`, `UiState`,
    /// `Clock` and `Navigation` must be set.
    pub fn init(cx: &mut App) {
        if !cx.has_global::<CaldirRevision>() {
            cx.set_global(CaldirRevision::default());
        }
        let store = cx.new(Self::new);
        cx.set_global(EventStoreHandle(store));
    }

    pub fn global(cx: &App) -> Entity<Self> {
        cx.global::<EventStoreHandle>().0.clone()
    }

    fn try_global(cx: &App) -> Option<Entity<Self>> {
        cx.try_global::<EventStoreHandle>()
            .map(|handle| handle.0.clone())
    }

    /// Makes sure viewer-zone days `[start, end)` are loaded (or loading).
    /// Cheap and idempotent: views call it with what they show.
    pub fn ensure_loaded(start: NaiveDate, end: NaiveDate, cx: &mut App) {
        if let Some(store) = Self::try_global(cx) {
            store.update(cx, |store, cx| store.ensure_range(start, end, cx));
        }
    }

    fn new(cx: &mut Context<Self>) -> Self {
        let subscriptions = vec![
            cx.observe_global::<CaldirRevision>(Self::caldir_changed),
            cx.observe_global::<Settings>(|this, cx| this.update_visible(cx)),
            cx.observe_global::<UiState>(|this, cx| this.update_visible(cx)),
            cx.observe_global::<Clock>(|this, cx| {
                let viewer = Clock::global(cx).viewer;
                if viewer != this.viewer {
                    this.set_viewer(viewer, cx);
                }
            }),
        ];
        let mut store = Self {
            calendars: Arc::default(),
            calendars_loaded: false,
            events: Arc::default(),
            revision: 0,
            visible: Vec::new(),
            desired: None,
            covered: None,
            syncing: false,
            pending_force: false,
            initial_loading: true,
            active_event: None,
            selected_event: None,
            invites: Arc::default(),
            viewer: Clock::global(cx).viewer,
            caldir_revision: *cx.global::<CaldirRevision>(),
            _subscriptions: subscriptions,
        };
        store.load_calendars(cx);
        store
    }

    pub fn calendars(&self) -> &Arc<Vec<Calendar>> {
        &self.calendars
    }

    pub fn events(&self) -> &Arc<Vec<CalendarEvent>> {
        &self.events
    }

    pub fn revision(&self) -> u64 {
        self.revision
    }

    /// Still waiting for the first events (or for the calendars).
    pub fn is_loading(&self) -> bool {
        self.initial_loading || !self.calendars_loaded
    }

    /// The range wanted loaded (it only grows); what the agenda extends.
    pub fn loaded_range(&self) -> Option<DateRange> {
        self.desired
    }

    /// Whether a load is in flight.
    pub fn is_fetching(&self) -> bool {
        self.syncing
    }

    /// Whether the events held cover viewer-zone `date`.
    pub fn covers(&self, date: NaiveDate) -> bool {
        self.covered
            .is_some_and(|range| range.start <= date && date < range.end)
    }

    pub fn visible_calendars(&self) -> &[String] {
        &self.visible
    }

    pub fn invites(&self) -> &Arc<Vec<CalendarEvent>> {
        &self.invites
    }

    pub fn calendar(&self, slug: &str) -> Option<&Calendar> {
        self.calendars.iter().find(|calendar| calendar.slug == slug)
    }

    pub fn active_event(&self) -> Option<&EventKey> {
        self.active_event.as_ref()
    }

    pub fn selected_event(&self) -> Option<&EventKey> {
        self.selected_event.as_ref()
    }

    pub fn set_active_event(&mut self, key: Option<EventKey>, cx: &mut Context<Self>) {
        if self.active_event != key {
            self.active_event = key;
            cx.notify();
        }
    }

    pub fn toggle_active_event(&mut self, key: EventKey, cx: &mut Context<Self>) {
        let next = (self.active_event.as_ref() != Some(&key)).then_some(key);
        self.set_active_event(next, cx);
    }

    pub fn set_selected_event(&mut self, key: Option<EventKey>, cx: &mut Context<Self>) {
        if self.selected_event != key {
            self.selected_event = key;
            cx.notify();
        }
    }

    pub fn event(&self, key: &EventKey) -> Option<&CalendarEvent> {
        self.events.iter().find(|event| &event.key() == key)
    }

    /// The open event's current data (`None` once it's gone, e.g. deleted).
    pub fn active_event_data(&self) -> Option<&CalendarEvent> {
        self.event(self.active_event.as_ref()?)
    }

    // Optimistic edits (`editing::commands`): applied at once, put back when
    // the write fails. The next load replaces them with what's on disk.

    /// Replaces the event keyed `key` (the original identity: an edit may
    /// move it to another calendar). False when it isn't loaded.
    pub fn replace_event(
        &mut self,
        key: &EventKey,
        event: CalendarEvent,
        cx: &mut Context<Self>,
    ) -> bool {
        let Some(index) = self.events.iter().position(|e| &e.key() == key) else {
            return false;
        };
        Arc::make_mut(&mut self.events)[index] = event.with_viewer(self.viewer);
        self.bump(cx);
        true
    }

    /// Removes the matching events and returns them, for a rollback.
    pub fn remove_events(
        &mut self,
        matches: impl Fn(&CalendarEvent) -> bool,
        cx: &mut Context<Self>,
    ) -> Vec<CalendarEvent> {
        if !self.events.iter().any(&matches) {
            return Vec::new();
        }
        let (removed, kept) = self.events.iter().cloned().partition(|e| matches(e));
        self.events = Arc::new(kept);
        self.bump(cx);
        removed
    }

    /// Adds events (an optimistic create, or a rollback of `remove_events`).
    pub fn insert_events(&mut self, events: Vec<CalendarEvent>, cx: &mut Context<Self>) {
        if events.is_empty() {
            return;
        }
        let viewer = self.viewer;
        Arc::make_mut(&mut self.events).extend(events.into_iter().map(|e| e.with_viewer(viewer)));
        self.bump(cx);
    }

    /// Swaps an optimistic create for the event the backend stored.
    pub fn reconcile_create(
        &mut self,
        optimistic: &EventKey,
        created: CalendarEvent,
        cx: &mut Context<Self>,
    ) {
        let created = created.with_viewer(self.viewer);
        reconcile_optimistic_create(Arc::make_mut(&mut self.events), optimistic, created);
        self.bump(cx);
    }

    pub fn rollback_create(&mut self, optimistic: &EventKey, cx: &mut Context<Self>) {
        rollback_optimistic_create(Arc::make_mut(&mut self.events), optimistic);
        self.bump(cx);
    }

    /// Adds an event that isn't in the loaded range (a search result far away).
    pub fn add_event_if_missing(&mut self, event: CalendarEvent, cx: &mut Context<Self>) {
        let key = event.key();
        if self.events.iter().any(|e| e.key() == key) {
            return;
        }
        Arc::make_mut(&mut self.events).push(event.with_viewer(self.viewer));
        self.bump(cx);
    }

    /// Refetches everything loaded (the content on disk changed).
    pub fn reload(&mut self, cx: &mut Context<Self>) {
        self.sync(true, cx);
    }

    fn bump(&mut self, cx: &mut Context<Self>) {
        self.revision += 1;
        cx.notify();
    }

    fn caldir_changed(&mut self, cx: &mut Context<Self>) {
        let revision = *cx.global::<CaldirRevision>();
        let previous = std::mem::replace(&mut self.caldir_revision, revision);
        if revision.calendars != previous.calendars {
            self.load_calendars(cx);
        }
        if revision.events != previous.events {
            self.reload(cx);
            self.load_invites(cx);
        }
    }

    fn set_viewer(&mut self, viewer: Tz, cx: &mut Context<Self>) {
        // Each event's date_info bakes in the viewer's zone; the events
        // themselves are unchanged on disk.
        self.viewer = viewer;
        for event in Arc::make_mut(&mut self.events) {
            event.refresh_date_info(viewer);
        }
        for invite in Arc::make_mut(&mut self.invites) {
            invite.refresh_date_info(viewer);
        }
        self.bump(cx);
    }

    fn load_calendars(&mut self, cx: &mut Context<Self>) {
        let Some(load) = Backend::read(cx, rencal_core::caldir::list_calendars) else {
            // No backend (tests): nothing to load.
            self.calendars_loaded = true;
            self.initial_loading = false;
            return;
        };
        cx.spawn(async move |this, cx| {
            let calendars = match load.await {
                Ok(Ok(calendars)) => backend::app_calendars(&calendars),
                Ok(Err(err)) => {
                    log::error!("could not list calendars: {err}");
                    Vec::new()
                }
                Err(err) => {
                    log::error!("listing calendars failed: {err}");
                    return;
                }
            };
            this.update(cx, |this, cx| this.set_calendars(calendars, cx))
                .ok();
        })
        .detach();
    }

    pub fn set_calendars(&mut self, calendars: Vec<Calendar>, cx: &mut Context<Self>) {
        log::debug!("calendars loaded: {}", calendars.len());
        let first_load = !self.calendars_loaded;
        self.calendars_loaded = true;
        if *self.calendars != calendars {
            self.calendars = Arc::new(calendars);
            self.load_invites(cx);
        }
        // The first load always settles visibility, which decides whether to
        // load events (or that there are none to load).
        self.refresh_visible(first_load, cx);
        cx.notify();
    }

    fn update_visible(&mut self, cx: &mut Context<Self>) {
        self.refresh_visible(false, cx);
    }

    fn refresh_visible(&mut self, force: bool, cx: &mut Context<Self>) {
        if !self.calendars_loaded {
            return;
        }
        let visible = visible_calendar_slugs(
            &self.calendars,
            &Settings::global(cx).rencal.groups,
            &UiState::global(cx).active_group,
        );
        if visible == self.visible && !force {
            return;
        }
        log::debug!("visible calendars: {visible:?}");
        self.visible = visible;
        if self.visible.is_empty() {
            self.events = Arc::default();
            self.covered = None;
            self.initial_loading = false;
            self.bump(cx);
        } else {
            self.reload(cx);
        }
    }

    fn load_invites(&mut self, cx: &mut Context<Self>) {
        let slugs: Vec<String> = self
            .calendars
            .iter()
            .filter(|calendar| calendar.provider.is_some())
            .map(|calendar| calendar.slug.clone())
            .collect();
        if slugs.is_empty() {
            if !self.invites.is_empty() {
                self.invites = Arc::default();
                cx.notify();
            }
            return;
        }
        let viewer = self.viewer;
        let Some(load) = Backend::read(cx, move |state| {
            rencal_core::caldir::list_invites(state, slugs)
                .map(|invites| backend::app_events(&invites, viewer))
        }) else {
            return;
        };
        cx.spawn(async move |this, cx| match load.await {
            Ok(Ok(invites)) => {
                this.update(cx, |this, cx| {
                    this.invites = Arc::new(invites);
                    cx.notify();
                })
                .ok();
            }
            Ok(Err(err)) => log::error!("could not list invitations: {err}"),
            Err(err) => log::error!("listing invitations failed: {err}"),
        })
        .detach();
    }

    fn ensure_range(&mut self, start: NaiveDate, end: NaiveDate, cx: &mut Context<Self>) {
        // The first request also covers the months around the active date,
        // which the agenda and minical show whichever view asked.
        let current = self
            .desired
            .unwrap_or_else(|| start_range_for_date(Navigation::active_date(cx)));
        let next = DateRange {
            start: start.min(current.start),
            end: end.max(current.end),
        };
        if self.desired == Some(next) && self.covered == Some(next) {
            return;
        }
        self.desired = Some(next);
        self.sync(false, cx);
    }

    fn sync(&mut self, force: bool, cx: &mut Context<Self>) {
        if self.syncing {
            // The running sync re-reads the desired range before it finishes;
            // only a forced reload needs flagging.
            self.pending_force |= force;
            return;
        }
        self.syncing = true;
        cx.spawn(async move |this, cx| {
            run_sync(this.clone(), force, cx).await;
            this.update(cx, |this, cx| {
                this.syncing = false;
                // Also after a failed load: the views show what there is.
                if this.initial_loading {
                    this.initial_loading = false;
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    /// The next fetch, or `None` when the events cover the desired range.
    fn plan(&mut self, force: bool, cx: &mut Context<Self>) -> Option<SyncPlan> {
        if self.visible.is_empty() {
            return None;
        }
        let desired = *self
            .desired
            .get_or_insert_with(|| start_range_for_date(Navigation::active_date(cx)));
        let slugs = self.visible.clone();
        let viewer = self.viewer;
        let fetch = |range: DateRange, cx: &App| {
            let slugs = slugs.clone();
            Backend::read(cx, move |state| {
                backend::list_events(state, slugs, range, viewer)
            })
        };

        let kind = match self.covered {
            Some(covered) if !force => {
                let before = (desired.start < covered.start).then_some(DateRange {
                    start: desired.start,
                    end: covered.start,
                });
                let after = (desired.end > covered.end).then_some(DateRange {
                    start: covered.end,
                    end: desired.end,
                });
                if before.is_none() && after.is_none() {
                    return None;
                }
                PlanKind::Incremental {
                    before: match before {
                        Some(range) => Some(fetch(range, cx)?),
                        None => None,
                    },
                    after: match after {
                        Some(range) => Some(fetch(range, cx)?),
                        None => None,
                    },
                    covered: DateRange {
                        start: covered.start.min(desired.start),
                        end: covered.end.max(desired.end),
                    },
                }
            }
            _ => PlanKind::Full(fetch(desired, cx)?),
        };
        Some(SyncPlan {
            visible: self.visible.clone(),
            desired,
            viewer,
            kind,
        })
    }

    /// Applies a finished fetch. `Some(force)` when another round is needed.
    fn apply(&mut self, plan: Fetched, cx: &mut Context<Self>) -> Option<bool> {
        let stale_selection = self.pending_force || plan.visible != self.visible;
        let widened = self
            .desired
            .is_some_and(|d| d.start < plan.desired.start || d.end > plan.desired.end);
        let redo = match &plan.result {
            FetchedKind::Full(_) => stale_selection || widened,
            FetchedKind::Incremental { .. } => stale_selection,
        };
        if redo {
            self.pending_force = false;
            return Some(true);
        }

        let fix_viewer = |mut events: Vec<CalendarEvent>, viewer: Tz| {
            if plan.viewer != viewer {
                events.iter_mut().for_each(|e| e.refresh_date_info(viewer));
            }
            events
        };
        match plan.result {
            FetchedKind::Full(events) => {
                let events = fix_viewer(events, self.viewer);
                if !same_event_list(&self.events, &events) {
                    self.events = Arc::new(events);
                    self.bump(cx);
                }
                self.covered = Some(plan.desired);
            }
            FetchedKind::Incremental {
                before,
                after,
                covered,
            } => {
                let before = fix_viewer(before, self.viewer);
                let after = fix_viewer(after, self.viewer);
                let mut changed = false;
                if !before.is_empty() || !after.is_empty() {
                    let events = Arc::make_mut(&mut self.events);
                    changed |= merge_events(events, before, MergePosition::Prepend);
                    changed |= merge_events(events, after, MergePosition::Append);
                }
                if changed {
                    self.bump(cx);
                }
                self.covered = Some(covered);
            }
        }

        let force = std::mem::take(&mut self.pending_force);
        let covers = match (self.covered, self.desired) {
            (Some(covered), Some(desired)) => {
                covered.start <= desired.start && covered.end >= desired.end
            }
            _ => false,
        };
        (force || !covers).then_some(force)
    }
}

type FetchHandle = JoinHandle<CoreResult<Vec<CalendarEvent>>>;

struct SyncPlan {
    visible: Vec<String>,
    desired: DateRange,
    viewer: Tz,
    kind: PlanKind,
}

enum PlanKind {
    Full(FetchHandle),
    Incremental {
        before: Option<FetchHandle>,
        after: Option<FetchHandle>,
        covered: DateRange,
    },
}

struct Fetched {
    visible: Vec<String>,
    desired: DateRange,
    viewer: Tz,
    result: FetchedKind,
}

enum FetchedKind {
    Full(Vec<CalendarEvent>),
    Incremental {
        before: Vec<CalendarEvent>,
        after: Vec<CalendarEvent>,
        covered: DateRange,
    },
}

async fn join(handle: FetchHandle) -> Option<Vec<CalendarEvent>> {
    match handle.await {
        Ok(Ok(events)) => Some(events),
        Ok(Err(err)) => {
            log::error!("could not load events: {err}");
            None
        }
        Err(err) => {
            log::error!("loading events failed: {err}");
            None
        }
    }
}

async fn run_sync(this: WeakEntity<EventStore>, mut force: bool, cx: &mut AsyncApp) {
    loop {
        let Ok(Some(plan)) = this.update(cx, |store, cx| store.plan(force, cx)) else {
            return;
        };
        let result = match plan.kind {
            PlanKind::Full(handle) => {
                let Some(events) = join(handle).await else {
                    return;
                };
                FetchedKind::Full(events)
            }
            PlanKind::Incremental {
                before,
                after,
                covered,
            } => {
                let before = match before {
                    Some(handle) => join(handle).await,
                    None => Some(Vec::new()),
                };
                let after = match after {
                    Some(handle) => join(handle).await,
                    None => Some(Vec::new()),
                };
                let (Some(before), Some(after)) = (before, after) else {
                    return;
                };
                FetchedKind::Incremental {
                    before,
                    after,
                    covered,
                }
            }
        };
        let fetched = Fetched {
            visible: plan.visible,
            desired: plan.desired,
            viewer: plan.viewer,
            result,
        };
        match this.update(cx, |store, cx| store.apply(fetched, cx)) {
            Ok(Some(next)) => force = next,
            _ => return,
        }
    }
}

/// Cheap identity check that skips no-op reloads: both lists come back sorted
/// by start, and `updated` bumps on every real edit.
fn same_event_list(a: &[CalendarEvent], b: &[CalendarEvent]) -> bool {
    a.len() == b.len()
        && a.iter().zip(b).all(|(a, b)| {
            a.calendar_slug == b.calendar_slug && a.id == b.id && a.updated == b.updated
        })
}

#[cfg(test)]
pub mod test_events {
    //! Event fixtures for UI tests.

    use chrono::NaiveDateTime;
    use rencal_time::{CalendarEvent, EventTime, Tz};

    fn base(
        id: &str,
        slug: &str,
        summary: &str,
        start: EventTime,
        end: EventTime,
    ) -> CalendarEvent {
        let json = serde_json::json!({
            "id": id,
            "summary": summary,
            "start": start,
            "end": end,
            "calendar_slug": slug,
        });
        serde_json::from_value(json).expect("a minimal event parses")
    }

    pub fn timed(id: &str, summary: &str, start: &str, end: &str, viewer: Tz) -> CalendarEvent {
        let parse = |s: &str| NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M").unwrap();
        base(
            id,
            "work",
            summary,
            EventTime::zoned(parse(start), viewer),
            EventTime::zoned(parse(end), viewer),
        )
        .with_viewer(viewer)
    }

    pub fn all_day(id: &str, summary: &str, start: &str, end: &str, viewer: Tz) -> CalendarEvent {
        let parse = |s: &str| s.parse().unwrap();
        base(
            id,
            "work",
            summary,
            EventTime::Date(parse(start)),
            EventTime::Date(parse(end)),
        )
        .with_viewer(viewer)
    }
}

#[cfg(test)]
impl EventStore {
    /// Replaces the events as if a load had covered `range`.
    pub fn set_test_events(
        &mut self,
        events: Vec<CalendarEvent>,
        range: DateRange,
        cx: &mut Context<Self>,
    ) {
        self.events = Arc::new(events);
        self.desired = Some(range);
        self.covered = Some(range);
        self.initial_loading = false;
        self.bump(cx);
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::time::{Duration, Instant};

    use gpui_kit::{BorrowAppContext, TestAppContext};
    use rencal_config::ThemeConfig;
    use rencal_core::state::{AppState, ProviderDirs};

    use super::*;
    use crate::runtime::Tokio;
    use crate::test_support;

    fn date(s: &str) -> NaiveDate {
        s.parse().unwrap()
    }

    fn write_event(calendar: &Path, uid: &str, summary: &str, start: &str, end: &str) {
        let ics = format!(
            "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//rencal test//EN\r\nBEGIN:VEVENT\r\nUID:{uid}\r\nDTSTAMP:20261001T000000Z\r\nDTSTART:{start}\r\nDTEND:{end}\r\nSUMMARY:{summary}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
        );
        std::fs::write(calendar.join(format!("{uid}.ics")), ics).unwrap();
    }

    fn calendar(data: &Path, slug: &str) -> std::path::PathBuf {
        let path = data.join(slug);
        std::fs::create_dir_all(path.join(".caldir")).unwrap();
        std::fs::write(
            path.join(".caldir/config.toml"),
            format!("name = \"{slug}\"\ncolor = \"#4c8bf5\"\n"),
        )
        .unwrap();
        path
    }

    fn summaries(cx: &mut TestAppContext) -> Vec<String> {
        cx.update(|cx| {
            let mut summaries: Vec<String> = EventStore::global(cx)
                .read(cx)
                .events()
                .iter()
                .map(|e| e.summary.clone())
                .collect();
            summaries.sort();
            summaries
        })
    }

    /// Runs the app until `done` holds; loads finish on the backend runtime.
    fn wait_until(cx: &mut TestAppContext, done: impl Fn(&mut TestAppContext) -> bool) {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            cx.run_until_parked();
            if done(cx) {
                return;
            }
            assert!(
                Instant::now() < deadline,
                "timed out; events: {:?}",
                summaries(cx)
            );
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    #[gpui_kit::test]
    fn loads_ranges_follows_groups_and_reloads_on_caldir_changes(cx: &mut TestAppContext) {
        cx.executor().allow_parking();
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("caldir");
        let work = calendar(&data, "work");
        let home = calendar(&data, "home");
        write_event(
            &work,
            "standup",
            "Standup",
            "20261007T090000Z",
            "20261007T091500Z",
        );
        write_event(&home, "gym", "Gym", "20261008T070000Z", "20261008T080000Z");
        write_event(
            &work,
            "far",
            "Far away",
            "20270315T090000Z",
            "20270315T100000Z",
        );
        let config = dir.path().join("config.toml");
        std::fs::write(&config, format!("calendar_dir = \"{}\"\n", data.display())).unwrap();

        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .unwrap();
        let state = Arc::new(AppState::load_from(config, ProviderDirs::default()).unwrap());
        cx.update(|cx| {
            test_support::init(ThemeConfig::default(), None, cx);
            Tokio::init(runtime.handle().clone(), cx);
            Backend::init(state.clone(), cx);
            EventStore::init(cx);
        });

        // The months around the active date load first; far events don't.
        wait_until(cx, |cx| summaries(cx) == ["Gym", "Standup"]);
        cx.update(|cx| {
            let store = EventStore::global(cx);
            let store = store.read(cx);
            assert!(!store.is_loading());
            assert_eq!(store.calendars().len(), 2);
            let event = &store.events()[0];
            assert_eq!(
                event.date_info,
                event.clone().with_viewer(chrono_tz::UTC).date_info
            );
        });

        // Views widen the range; only the missing slice is fetched and merged.
        cx.update(|cx| EventStore::ensure_loaded(date("2027-03-01"), date("2027-04-01"), cx));
        wait_until(cx, |cx| summaries(cx) == ["Far away", "Gym", "Standup"]);

        // A group shows its calendars only.
        cx.update(|cx| {
            Settings::update(cx, |settings| {
                settings
                    .rencal
                    .groups
                    .insert("fitness".into(), vec!["home".into()]);
            });
            UiState::update(cx, |ui| ui.active_group = "fitness".into());
        });
        wait_until(cx, |cx| summaries(cx) == ["Gym"]);
        cx.update(|cx| UiState::update(cx, |ui| ui.active_group = "default".into()));
        wait_until(cx, |cx| summaries(cx).len() == 3);

        // An edit on disk (the watcher bumps the revision) reloads.
        write_event(
            &home,
            "dinner",
            "Dinner",
            "20261009T180000Z",
            "20261009T200000Z",
        );
        state.invalidate_events("home");
        cx.update(|cx| cx.update_global::<CaldirRevision, _>(|revision, _| revision.events += 1));
        wait_until(cx, |cx| summaries(cx).contains(&"Dinner".to_owned()));
        drop(runtime);
    }
}
