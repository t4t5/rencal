//! Starts the `rencal_core` watchers and turns the changes they report into
//! webview events. Watchers that only feed `AppState` reach the webview through
//! `state_bridge`.

use std::sync::Arc;

use rencal_core::plugins::PluginManager;
use rencal_core::state::AppState;
use rencal_core::tasks::spawn_task;
use rencal_core::watchers::{caldir, caldir_config, plugins, rencal_config, tz};
use rencal_core::{external_themes, omarchy};
use tauri::AppHandle;

use crate::events::AppEvent;

pub fn spawn_all(app: &AppHandle, state: &Arc<AppState>, plugin_manager: &PluginManager) {
    let handle = app.clone();
    spawn_task(
        "omarchy theme watcher",
        omarchy::run_watcher(move |colors| {
            let _ = AppEvent::OmarchyThemeChanged(colors).emit(&handle);
        }),
    );
    let handle = app.clone();
    spawn_task(
        "external themes watcher",
        external_themes::run_watcher(move |themes| {
            let _ = AppEvent::ExternalThemesChanged(themes).emit(&handle);
        }),
    );
    spawn_task("caldir watcher", caldir::run_watcher(state.clone()));
    spawn_task(
        "caldir config watcher",
        caldir_config::run_watcher(state.clone()),
    );
    let handle = app.clone();
    spawn_task(
        "rencal config watcher",
        rencal_config::run_watcher(move || {
            let _ = AppEvent::RencalConfigChanged(()).emit(&handle);
        }),
    );
    let handle = app.clone();
    spawn_task(
        "plugin declarations watcher",
        plugins::run_watcher(plugin_manager.clone(), state.clone(), move || {
            let _ = AppEvent::ExternalThemesChanged(external_themes::scan()).emit(&handle);
        }),
    );
    let handle = app.clone();
    spawn_task(
        "timezone watcher",
        tz::run_watcher(move |tz| {
            let _ = AppEvent::SystemTzChanged(tz).emit(&handle);
        }),
    );
}
