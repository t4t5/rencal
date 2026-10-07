//! `SyncState` (GPUI_PORT_PLAN.md §3.3, port of `SyncContext`): checks the
//! connected calendars for changes and syncs them, automatically (on start,
//! when the calendars change and when the main window gains focus, applying
//! only with auto-sync on) or on demand (`s`, the toolbar button).
//!
//! Calendars whose pending push would delete `MASS_DELETE_THRESHOLD` or more
//! events are left unpushed by the backend and reported in
//! `pending_mass_delete`. The confirm dialog for them arrives in Phase 5;
//! until then the sync lock is released so later syncs still run.

use gpui_kit::{App, BorrowAppContext, Global};
use rencal_core::caldir;

use crate::backend::Backend;
use crate::event_store::EventStore;
use crate::settings::Settings;

const MASS_DELETE_THRESHOLD: u32 = 10;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SyncStatus {
    #[default]
    Idle,
    Checking,
    Syncing,
}

/// One calendar's outstanding changes (the backend's `SyncPreview`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingSync {
    pub calendar_slug: String,
    pub to_push: u32,
    pub to_push_delete: u32,
    pub to_pull: u32,
}

impl From<&caldir::SyncPreview> for PendingSync {
    fn from(preview: &caldir::SyncPreview) -> Self {
        Self {
            calendar_slug: preview.calendar_slug.clone(),
            to_push: preview.to_push_count,
            to_push_delete: preview.to_push_delete_count,
            to_pull: preview.to_pull_count,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct SyncState {
    pub status: SyncStatus,
    pub error: Option<String>,
    /// Calendars with changes to push or pull.
    pub pending: Vec<PendingSync>,
    pub pending_mass_delete: Option<Vec<PendingSync>>,
    /// Re-entrancy lock (not a mirror of `status`).
    locked: bool,
    /// The connected calendars the last automatic check ran for.
    synced_slugs: Vec<String>,
}

impl Global for SyncState {}

impl SyncState {
    pub fn global(cx: &App) -> &Self {
        cx.global::<Self>()
    }

    /// Installs the state and checks again whenever the connected calendars
    /// change. `EventStore` must be set.
    pub fn init(cx: &mut App) {
        cx.set_global(Self::default());
        let store = EventStore::global(cx);
        cx.observe(&store, |store, cx| {
            let slugs = connected_calendars(store.read(cx).calendars());
            if slugs != Self::global(cx).synced_slugs {
                cx.update_global::<Self, _>(|state, _| state.synced_slugs = slugs);
                Self::request(cx);
            }
        })
        .detach();
    }

    pub fn pending_count(&self) -> u32 {
        self.pending.iter().map(|p| p.to_push + p.to_pull).sum()
    }

    /// An automatic check; applies changes only with auto-sync on.
    pub fn request(cx: &mut App) {
        let apply = Settings::global(cx).rencal.auto_sync_enabled;
        Self::run(apply, false, cx);
    }

    /// "Sync now": always applies.
    pub fn sync_now(cx: &mut App) {
        Self::run(true, true, cx);
    }

    fn update(cx: &mut App, edit: impl FnOnce(&mut Self)) {
        cx.update_global::<Self, _>(|state, _| edit(state));
    }

    fn run(apply: bool, manual: bool, cx: &mut App) {
        if !cx.has_global::<Self>() {
            return;
        }
        let store = EventStore::global(cx);
        let has_connected = !connected_calendars(store.read(cx).calendars()).is_empty();
        if !has_connected || Self::global(cx).locked {
            return;
        }
        let Some(preview) = Backend::run(
            cx,
            |state| async move { caldir::sync_preview(&state).await },
        ) else {
            return;
        };
        // A manual sync reports the whole run as "syncing", so it never shows
        // just "checking" when the preview turns out empty.
        Self::update(cx, |state| {
            state.locked = true;
            state.status = if manual {
                SyncStatus::Syncing
            } else {
                SyncStatus::Checking
            };
            state.error = None;
        });

        cx.spawn(async move |cx| {
            let result: Result<(), String> = async {
                let previews: Vec<PendingSync> = preview
                    .await
                    .map_err(|err| err.to_string())?
                    .map_err(|err| err.to_string())?
                    .iter()
                    .map(PendingSync::from)
                    .collect();
                let with_work: Vec<PendingSync> = previews
                    .iter()
                    .filter(|p| p.to_push > 0 || p.to_pull > 0)
                    .cloned()
                    .collect();
                let has_work = !with_work.is_empty();
                cx.update(|cx| Self::update(cx, |state| state.pending = with_work));
                if !apply {
                    return Ok(());
                }

                if has_work {
                    cx.update(|cx| Self::update(cx, |state| state.status = SyncStatus::Syncing));
                    let sync = cx.update(|cx| {
                        Backend::run(
                            cx,
                            |state| async move { caldir::sync(&state, Vec::new()).await },
                        )
                    });
                    if let Some(sync) = sync {
                        sync.await
                            .map_err(|err| err.to_string())?
                            .map_err(|err| err.to_string())?;
                    }
                    cx.update(|cx| {
                        EventStore::global(cx).update(cx, |store, cx| store.reload(cx));
                    });
                }

                let tripped: Vec<PendingSync> = previews
                    .into_iter()
                    .filter(|p| p.to_push_delete >= MASS_DELETE_THRESHOLD)
                    .collect();
                cx.update(|cx| {
                    Self::update(cx, |state| {
                        if tripped.is_empty() {
                            state.pending.clear();
                        } else {
                            log::warn!(
                                "sync held back mass deletions in {:?}",
                                tripped.iter().map(|t| &t.calendar_slug).collect::<Vec<_>>()
                            );
                            state.pending_mass_delete = Some(tripped);
                        }
                    })
                });
                Ok(())
            }
            .await;

            cx.update(|cx| {
                Self::update(cx, |state| {
                    if let Err(err) = result {
                        log::error!("sync failed: {err}");
                        state.error = Some(err);
                    }
                    state.locked = false;
                    state.status = SyncStatus::Idle;
                })
            });
        })
        .detach();
    }
}

fn connected_calendars(calendars: &[rencal_time::Calendar]) -> Vec<String> {
    calendars
        .iter()
        .filter(|calendar| calendar.provider.is_some())
        .map(|calendar| calendar.slug.clone())
        .collect()
}
