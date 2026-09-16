//! The one task that turns `AppState` notifications into webview events.
//! Every event name the backend emits for state changes is declared here.

use std::sync::Arc;

use tauri::{AppHandle, Emitter};

use crate::routes::caldir::CaldirSettings;
use crate::state::AppState;

/// Payload: `CaldirSettings`. Fired on every caldir config change.
pub const CALDIR_CONFIG_CHANGED: &str = "caldir-config-changed";
/// No payload. The set of calendars or their metadata changed.
pub const CALENDARS_CHANGED: &str = "calendars-changed";
/// No payload. Event data on disk changed outside the calling RPC.
pub const EVENTS_CHANGED: &str = "events-changed";

pub async fn run(app: AppHandle, state: Arc<AppState>) {
    let mut config = state.subscribe_caldir_config();
    let mut calendars = state.subscribe_calendars_changed();
    let mut events = state.subscribe_events_changed();

    config.borrow_and_update();
    calendars.borrow_and_update();
    events.borrow_and_update();

    loop {
        tokio::select! {
            changed = config.changed() => {
                if changed.is_err() {
                    return;
                }
                let settings = CaldirSettings::from(&*config.borrow_and_update());
                let _ = app.emit(CALDIR_CONFIG_CHANGED, settings);
            }
            changed = calendars.changed() => {
                if changed.is_err() {
                    return;
                }
                calendars.borrow_and_update();
                let _ = app.emit(CALENDARS_CHANGED, ());
            }
            changed = events.changed() => {
                if changed.is_err() {
                    return;
                }
                events.borrow_and_update();
                let _ = app.emit(EVENTS_CHANGED, ());
            }
        }
    }
}
