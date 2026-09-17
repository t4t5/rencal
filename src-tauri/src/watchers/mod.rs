//! Background watchers: filesystem → backend state / webview events. Each one
//! is a filter function plus a loop on `fs_watch::watch_debounced`.

use std::sync::Arc;

use tauri::AppHandle;

use crate::state::AppState;
use crate::tasks::spawn_task;
use crate::{external_themes, omarchy};

pub mod caldir;
pub mod caldir_config;
pub mod rencal_config;
pub mod tz;

pub fn spawn_all(app: &AppHandle, state: &Arc<AppState>) {
    spawn_task("omarchy theme watcher", omarchy::run_watcher(app.clone()));
    spawn_task(
        "external themes watcher",
        external_themes::run_watcher(app.clone()),
    );
    spawn_task("caldir watcher", caldir::run_watcher(state.clone()));
    spawn_task(
        "caldir config watcher",
        caldir_config::run_watcher(state.clone()),
    );
    spawn_task(
        "rencal config watcher",
        rencal_config::run_watcher(app.clone()),
    );
    spawn_task("timezone watcher", tz::run_watcher(app.clone()));
}
