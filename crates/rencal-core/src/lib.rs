//! renCal's UI-independent backend: process state, filesystem watchers,
//! caldir operations, plugins, external themes and platform helpers. UI shells
//! (the Tauri app today, the GPUI app next) depend on this crate and never
//! touch caldir directly.
//!
//! Feature `specta` derives `specta::Type` on the types the Tauri app exports
//! to TypeScript.

pub mod caldir;
pub mod deep_links;
pub mod error;
pub mod event_cache;
pub mod external_themes;
pub mod fs_watch;
#[cfg(target_os = "linux")]
pub mod linux_reminders;
pub mod oauth;
pub mod omarchy;
pub mod platform;
pub mod plugins;
pub mod signal;
#[cfg(target_os = "linux")]
pub mod single_instance;
pub mod skill_install;
pub mod state;
pub mod tasks;
pub mod user_themes;
pub mod watchers;
