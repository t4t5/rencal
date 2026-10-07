//! Calendar and event operations over the caldir directory. Each submodule is
//! one operation, exported under its own name.
//!
//! Operations take `&AppState`. Most are plain `fn`s: they block on disk I/O
//! and never await, so async callers run them off the UI thread. The few that
//! talk to a provider are `async` and must not hold `state.caldir()` across an
//! `.await` (the guard is `!Send`, so that is a compile error rather than a
//! stall).

mod conference;
mod helpers;
mod types;

mod check_provider_connection;
mod connect_provider;
mod connect_provider_with_credentials;
mod create_event;
mod create_local_calendar;
mod delete_calendar;
mod delete_event;
mod delete_recurring_series;
mod discard;
mod find_event;
mod get_config;
mod get_event;
mod get_provider_connect_info;
mod list_calendars;
mod list_contacts;
mod list_events;
mod list_invites;
mod list_providers;
mod rename_calendar;
mod rsvp;
mod search_events;
mod set_calendar_color;
mod set_config;
mod split_recurring_series_at;
mod sync;
mod sync_preview;
mod update_event;

pub use types::*;

pub use check_provider_connection::check_provider_connection;
pub use connect_provider::{OpenUrl, connect_provider};
pub use connect_provider_with_credentials::connect_provider_with_credentials;
pub use create_event::create_event;
pub use create_local_calendar::create_local_calendar;
pub use delete_calendar::delete_calendar;
pub use delete_event::delete_event;
pub use delete_recurring_series::delete_recurring_series;
pub use discard::discard;
pub use find_event::find_event;
pub use get_config::get_caldir_settings;
pub use get_event::get_event;
pub use get_provider_connect_info::get_provider_connect_info;
pub use list_calendars::list_calendars;
pub use list_contacts::list_contacts;
pub use list_events::list_events;
pub use list_invites::list_invites;
pub use list_providers::list_providers;
pub use rename_calendar::rename_calendar;
pub use rsvp::rsvp;
pub use search_events::search_events;
pub use set_calendar_color::set_calendar_color;
pub use set_config::{
    set_calendar_dir, set_default_calendar, set_default_reminders, set_time_format,
};
pub use split_recurring_series_at::split_recurring_series_at;
pub use sync::sync;
pub use sync_preview::sync_preview;
pub use update_event::update_event;
