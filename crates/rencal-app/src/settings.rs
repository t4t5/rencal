//! The `Settings` global (GPUI_PORT_PLAN.md §3.3): renCal's own config
//! (`~/.config/rencal/config.toml`), caldir's settings and the system
//! timezone. Watchers (`watchers.rs`) keep it current; observe it with
//! `cx.observe_global::<Settings>`. It only changes when a value does.

use std::sync::Arc;

use gpui_kit::{App, AppContext, Global};
use rencal_config::RencalConfig;
use rencal_core::caldir::{self, CaldirSettings};
use rencal_core::error::CoreResult;
use rencal_core::state::AppState;

use crate::backend::Backend;
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

    pub fn first_day_of_week(&self) -> rencal_time::FirstDayOfWeek {
        match self.rencal.first_day_of_week {
            rencal_config::FirstDayOfWeek::Monday => rencal_time::FirstDayOfWeek::Monday,
            rencal_config::FirstDayOfWeek::Sunday => rencal_time::FirstDayOfWeek::Sunday,
        }
    }

    pub fn time_format(&self) -> rencal_time::TimeFormat {
        match self.caldir.time_format {
            rencal_core::caldir::TimeFormat::H24 => rencal_time::TimeFormat::H24,
            rencal_core::caldir::TimeFormat::H12 => rencal_time::TimeFormat::H12,
        }
    }

    /// Applies `edit` now and persists it. The write re-reads the file first,
    /// so it never overwrites edits made elsewhere with stale values, and it
    /// never replaces an unreadable file with defaults. Without the backend
    /// runtime (tests) nothing is written.
    pub fn update_rencal(cx: &mut App, edit: impl Fn(&mut RencalConfig) + Send + Sync + 'static) {
        let edit = Arc::new(edit);
        Self::update(cx, |settings| edit(&mut settings.rencal));
        if !cx.has_global::<Tokio>() {
            return;
        }
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

impl Settings {
    /// Applies a caldir setting now and saves it through the backend; the
    /// caldir config watcher then confirms the stored value.
    fn update_caldir(
        cx: &mut App,
        edit: impl FnOnce(&mut CaldirSettings),
        save: impl FnOnce(&AppState) -> CoreResult<()> + Send + 'static,
    ) {
        Self::update(cx, |settings| edit(&mut settings.caldir));
        let Some(task) = Backend::write(cx, save) else {
            return;
        };
        cx.background_spawn(async move {
            match task.await {
                Ok(Ok(())) => {}
                Ok(Err(err)) => log::error!("could not save caldir's config: {err}"),
                Err(err) => log::error!("saving caldir's config failed: {err}"),
            }
        })
        .detach();
    }

    pub fn set_time_format(time_format: caldir::TimeFormat, cx: &mut App) {
        let saved = time_format.clone();
        Self::update_caldir(
            cx,
            |settings| settings.time_format = time_format,
            move |state| caldir::set_time_format(state, saved),
        );
    }

    pub fn set_default_reminders(minutes: Vec<i32>, cx: &mut App) {
        let saved = minutes.clone();
        Self::update_caldir(
            cx,
            |settings| settings.default_reminders = minutes,
            move |state| caldir::set_default_reminders(state, saved),
        );
    }

    pub fn set_default_calendar(slug: Option<String>, cx: &mut App) {
        let saved = slug.clone();
        Self::update_caldir(
            cx,
            |settings| settings.default_calendar = slug,
            move |state| caldir::set_default_calendar(state, saved),
        );
    }

    /// Not applied up front: the backend normalises the path, and the
    /// watcher reports the stored one.
    pub fn set_calendar_dir(path: String, cx: &mut App) {
        Self::update_caldir(
            cx,
            |_| {},
            move |state| caldir::set_calendar_dir(state, path),
        );
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
