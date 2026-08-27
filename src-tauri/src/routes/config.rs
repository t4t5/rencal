use std::collections::BTreeMap;

use rencal_config::RencalConfig;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::routes::TauResult;

/// RPC mirror of `rencal_config::FirstDayOfWeek` (the config crate stays free
/// of specta/taurpc so the notifier daemon can depend on it).
#[derive(Clone, Copy, Serialize, Deserialize, Type)]
pub enum FirstDayOfWeek {
    #[serde(rename = "monday")]
    Monday,
    #[serde(rename = "sunday")]
    Sunday,
}

impl From<rencal_config::FirstDayOfWeek> for FirstDayOfWeek {
    fn from(value: rencal_config::FirstDayOfWeek) -> Self {
        match value {
            rencal_config::FirstDayOfWeek::Monday => Self::Monday,
            rencal_config::FirstDayOfWeek::Sunday => Self::Sunday,
        }
    }
}

impl From<FirstDayOfWeek> for rencal_config::FirstDayOfWeek {
    fn from(value: FirstDayOfWeek) -> Self {
        match value {
            FirstDayOfWeek::Monday => Self::Monday,
            FirstDayOfWeek::Sunday => Self::Sunday,
        }
    }
}

// `get_theme` returns `Some(theme)` if the config file exists, `None` if it
// has never been written. The frontend uses the `None` case to migrate a
// pre-existing `localStorage["theme"]` value up to TOML on first run.
#[taurpc::procedures(path = "config", export_to = "../src/rpc/bindings.ts")]
pub trait ConfigApi {
    async fn get_theme() -> TauResult<Option<String>>;
    async fn set_theme(theme: String) -> TauResult<()>;
    async fn get_notifications_enabled() -> TauResult<bool>;
    async fn set_notifications_enabled(enabled: bool) -> TauResult<()>;
    async fn get_auto_sync_enabled() -> TauResult<bool>;
    async fn set_auto_sync_enabled(enabled: bool) -> TauResult<()>;
    async fn get_first_day_of_week() -> TauResult<FirstDayOfWeek>;
    async fn set_first_day_of_week(day: FirstDayOfWeek) -> TauResult<()>;
    async fn get_groups() -> TauResult<BTreeMap<String, Vec<String>>>;
    async fn set_groups(groups: BTreeMap<String, Vec<String>>) -> TauResult<()>;
}

#[derive(Clone)]
pub struct ConfigApiImpl;

#[taurpc::resolvers]
impl ConfigApi for ConfigApiImpl {
    async fn get_theme(self) -> TauResult<Option<String>> {
        if !RencalConfig::exists() {
            return Ok(None);
        }
        Ok(Some(RencalConfig::load().theme))
    }

    async fn set_theme(self, theme: String) -> TauResult<()> {
        let mut config = RencalConfig::load();
        config.theme = theme;
        config.save()
    }

    async fn get_notifications_enabled(self) -> TauResult<bool> {
        Ok(RencalConfig::load().notifications_enabled)
    }

    async fn set_notifications_enabled(self, enabled: bool) -> TauResult<()> {
        let mut config = RencalConfig::load();
        config.notifications_enabled = enabled;
        config.save()
    }

    async fn get_auto_sync_enabled(self) -> TauResult<bool> {
        Ok(RencalConfig::load().auto_sync_enabled)
    }

    async fn set_auto_sync_enabled(self, enabled: bool) -> TauResult<()> {
        let mut config = RencalConfig::load();
        config.auto_sync_enabled = enabled;
        config.save()
    }

    async fn get_first_day_of_week(self) -> TauResult<FirstDayOfWeek> {
        Ok(RencalConfig::load().first_day_of_week.into())
    }

    async fn set_first_day_of_week(self, day: FirstDayOfWeek) -> TauResult<()> {
        let mut config = RencalConfig::load();
        config.first_day_of_week = day.into();
        config.save()
    }

    async fn get_groups(self) -> TauResult<BTreeMap<String, Vec<String>>> {
        Ok(RencalConfig::load().groups)
    }

    async fn set_groups(self, groups: BTreeMap<String, Vec<String>>) -> TauResult<()> {
        let mut config = RencalConfig::load();
        config.groups = groups;
        config.save()
    }
}
