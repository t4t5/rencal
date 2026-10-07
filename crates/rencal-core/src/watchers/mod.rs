//! Background watchers: filesystem → backend state / UI notifications. Each one
//! is a filter function plus a loop on `fs_watch::watch_debounced`. Watchers
//! that only feed `AppState` take it directly; the others report through a
//! callback so each UI shell decides how to deliver the change.

pub mod caldir;
pub mod caldir_config;
pub mod plugins;
pub mod rencal_config;
pub mod tz;
