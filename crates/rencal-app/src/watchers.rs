//! Starts the `rencal_core` watchers on the backend runtime and turns what they
//! report into global updates (GPUI_PORT_PLAN.md §3.2). This replaces the
//! Tauri app's `state_bridge.rs` and `AppEvent`: every `AppState` watch channel
//! and every callback watcher gets one long-lived `cx.spawn` loop.

use std::future::Future;
use std::sync::Arc;

use ::rencal_config::RencalConfig;
use gpui_kit::{App, BorrowAppContext, Global};
use rencal_core::caldir::CaldirSettings;
use rencal_core::plugins::PluginManager;
use rencal_core::state::AppState;
use rencal_core::tasks::spawn_task;
use rencal_core::watchers::{caldir, caldir_config, plugins, rencal_config, tz};
use rencal_core::{omarchy, user_themes};
use tokio::sync::mpsc;

use crate::runtime::Tokio;
use crate::settings::Settings;
use crate::theme::{ThemeStore, omarchy_colors};

/// Bumped when caldir data changes outside the app (sync, the caldir CLI,
/// hand edits) or the providers change. The views that load caldir data
/// observe this and refetch.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct CaldirRevision {
    pub calendars: u64,
    pub events: u64,
    pub providers: u64,
}

impl Global for CaldirRevision {}

pub fn spawn_all(state: &Arc<AppState>, plugin_manager: &PluginManager, cx: &mut App) {
    cx.set_global(CaldirRevision::default());
    {
        let _runtime = Tokio::handle(cx).enter();
        spawn_task("caldir watcher", caldir::run_watcher(state.clone()));
        spawn_task(
            "caldir config watcher",
            caldir_config::run_watcher(state.clone()),
        );
        spawn_task(
            "plugin declarations watcher",
            plugins::run_watcher(plugin_manager.clone(), state.clone(), || {
                log::debug!("plugins reconciled");
            }),
        );
    }
    follow_state(state.clone(), cx);

    forward(
        cx,
        "rencal config watcher",
        |tx| {
            rencal_config::run_watcher(move || {
                let _ = tx.send(());
            })
        },
        |(), cx| reload_rencal_config(cx),
    );
    forward(
        cx,
        "timezone watcher",
        |tx| {
            tz::run_watcher(move |tz| {
                let _ = tx.send(tz);
            })
        },
        |tz, cx| Settings::update(cx, |settings| settings.system_tz = Some(tz)),
    );
    forward(
        cx,
        "omarchy theme watcher",
        |tx| {
            omarchy::run_watcher(move |colors| {
                let _ = tx.send(colors);
            })
        },
        |colors, cx| ThemeStore::set_omarchy(Some(omarchy_colors(colors)), cx),
    );
    forward(
        cx,
        "user theme watcher",
        |tx| {
            user_themes::run_watcher(move |snapshot| {
                let _ = tx.send(snapshot);
            })
        },
        ThemeStore::set_user_themes,
    );
}

/// Runs a callback watcher on the backend runtime and applies each value it
/// reports on the main thread.
fn forward<T, W, F>(
    cx: &mut App,
    name: &'static str,
    watcher: W,
    mut apply: impl FnMut(T, &mut App) + 'static,
) where
    T: Send + 'static,
    W: FnOnce(mpsc::UnboundedSender<T>) -> F,
    F: Future<Output = ()> + Send + 'static,
{
    let (tx, mut rx) = mpsc::unbounded_channel();
    {
        let _runtime = Tokio::handle(cx).enter();
        spawn_task(name, watcher(tx));
    }
    cx.spawn(async move |cx| {
        while let Some(value) = rx.recv().await {
            cx.update(|cx| apply(value, cx));
        }
    })
    .detach();
}

/// The caldir config (Settings) and the change signals (`CaldirRevision`).
fn follow_state(state: Arc<AppState>, cx: &mut App) {
    let mut config = state.subscribe_caldir_config();
    let mut calendars = state.subscribe_calendars_changed();
    let mut events = state.subscribe_events_changed();
    let mut providers = state.subscribe_providers_changed();
    config.borrow_and_update();
    calendars.borrow_and_update();
    events.borrow_and_update();
    providers.borrow_and_update();

    cx.spawn(async move |cx| {
        loop {
            tokio::select! {
                changed = config.changed() => {
                    if changed.is_err() {
                        return;
                    }
                    let caldir = CaldirSettings::from(&*config.borrow_and_update());
                    cx.update(|cx| Settings::update(cx, |settings| settings.caldir = caldir));
                }
                changed = calendars.changed() => {
                    if changed.is_err() {
                        return;
                    }
                    calendars.borrow_and_update();
                    cx.update(|cx| bump(cx, |revision| revision.calendars += 1));
                }
                changed = events.changed() => {
                    if changed.is_err() {
                        return;
                    }
                    events.borrow_and_update();
                    cx.update(|cx| bump(cx, |revision| revision.events += 1));
                }
                changed = providers.changed() => {
                    if changed.is_err() {
                        return;
                    }
                    providers.borrow_and_update();
                    cx.update(|cx| bump(cx, |revision| revision.providers += 1));
                }
            }
        }
    })
    .detach();
}

fn bump(cx: &mut App, edit: impl FnOnce(&mut CaldirRevision)) {
    cx.update_global::<CaldirRevision, _>(|revision, _| edit(revision));
}

/// Re-reads renCal's config off the main thread. A broken file keeps the
/// settings in place.
fn reload_rencal_config(cx: &mut App) {
    let load = Tokio::spawn_blocking(cx, RencalConfig::load);
    cx.spawn(async move |cx| match load.await {
        Ok(Ok(config)) => cx.update(|cx| Settings::update(cx, |settings| settings.rencal = config)),
        Ok(Err(err)) => log::warn!("{err}; keeping the previous settings"),
        Err(err) => log::error!("reading renCal's config failed: {err}"),
    })
    .detach();
}
