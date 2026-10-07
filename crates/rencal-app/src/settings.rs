//! The `Settings` global (GPUI_PORT_PLAN.md §3.3): renCal's own config
//! (`~/.config/rencal/config.toml`), caldir's settings and the system
//! timezone. Watchers (`watchers.rs`) keep it current; observe it with
//! `cx.observe_global::<Settings>`. It only changes when a value does.

use std::sync::Arc;

use gpui_kit::{App, Global};
use rencal_config::RencalConfig;
use rencal_core::caldir::CaldirSettings;

use crate::runtime::Tokio;

#[derive(Clone, Debug, PartialEq)]
pub struct Settings {
    pub rencal: RencalConfig,
    pub caldir: CaldirSettings,
    /// IANA name, e.g. `Europe/Stockholm`; `None` when it cannot be read.
    pub system_tz: Option<String>,
}

impl Global for Settings {}

impl Settings {
    pub fn global(cx: &App) -> &Self {
        cx.global::<Self>()
    }

    /// Replaces the global when `edit` changes it.
    pub fn update(cx: &mut App, edit: impl FnOnce(&mut Settings)) {
        let mut next = Self::global(cx).clone();
        edit(&mut next);
        if next != *Self::global(cx) {
            cx.set_global(next);
        }
    }

    /// Applies `edit` now and persists it. The write re-reads the file first,
    /// so it never overwrites edits made elsewhere with stale values, and it
    /// never replaces an unreadable file with defaults.
    pub fn update_rencal(cx: &mut App, edit: impl Fn(&mut RencalConfig) + Send + Sync + 'static) {
        let edit = Arc::new(edit);
        Self::update(cx, |settings| edit(&mut settings.rencal));
        Tokio::spawn_blocking(cx, move || {
            let result = RencalConfig::load().and_then(|mut config| {
                edit(&mut config);
                config.save()
            });
            if let Err(err) = result {
                log::error!("could not save renCal's config: {err}");
            }
        });
    }
}

/// Reads renCal's config, falling back to defaults (with a warning) when the
/// file is unreadable. The file itself is left alone.
pub fn load_rencal_config() -> RencalConfig {
    RencalConfig::load().unwrap_or_else(|err| {
        log::warn!("{err}; using default settings");
        RencalConfig::default()
    })
}
