//! The one task that turns `AppState` notifications into webview events.
//! The shared notification contract lives in `events`; AppState stays Tauri-free.

use crate::events::AppEvent;

use std::sync::Arc;

use tauri::AppHandle;

use crate::routes::caldir::CaldirSettings;
use crate::state::AppState;

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
                let _ = AppEvent::CaldirConfigChanged(settings).emit(&app);
            }
            changed = calendars.changed() => {
                if changed.is_err() {
                    return;
                }
                calendars.borrow_and_update();
                let _ = AppEvent::CalendarsChanged(()).emit(&app);
            }
            changed = events.changed() => {
                if changed.is_err() {
                    return;
                }
                events.borrow_and_update();
                let _ = AppEvent::EventsChanged(()).emit(&app);
            }
        }
    }
}
