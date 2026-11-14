use crate::routes::error::RpcError;
use std::collections::BTreeMap;

use rencal_config::{MAX_EXTRA_TIME_ZONES, RencalConfig};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::routes::RpcResult;

/// RPC mirror of `rencal_config::FirstDayOfWeek` (the config crate stays free
/// of specta so the notifier daemon can depend on it).
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

/// RPC mirror of `rencal_config::ThemeMode`.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    System,
    Single,
}

impl From<rencal_config::ThemeMode> for ThemeMode {
    fn from(value: rencal_config::ThemeMode) -> Self {
        match value {
            rencal_config::ThemeMode::System => Self::System,
            rencal_config::ThemeMode::Single => Self::Single,
        }
    }
}

impl From<ThemeMode> for rencal_config::ThemeMode {
    fn from(value: ThemeMode) -> Self {
        match value {
            ThemeMode::System => Self::System,
            ThemeMode::Single => Self::Single,
        }
    }
}

/// RPC mirror of `rencal_config::ThemeConfig`, saved and broadcast together.
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct ThemeSettings {
    pub mode: ThemeMode,
    pub single: String,
    pub light: String,
    pub dark: String,
}

impl From<rencal_config::ThemeConfig> for ThemeSettings {
    fn from(value: rencal_config::ThemeConfig) -> Self {
        Self {
            mode: value.mode.into(),
            single: value.single,
            light: value.light,
            dark: value.dark,
        }
    }
}

impl From<ThemeSettings> for rencal_config::ThemeConfig {
    fn from(value: ThemeSettings) -> Self {
        Self {
            mode: value.mode.into(),
            single: value.single,
            light: value.light,
            dark: value.dark,
        }
    }
}


#[derive(Clone)]
pub struct ConfigApiImpl;

impl ConfigApiImpl {
    pub async fn get_theme(self) -> RpcResult<ThemeSettings> {
        Ok(RencalConfig::load()?.theme.into())
    }

    pub async fn set_theme(self, settings: ThemeSettings) -> RpcResult<()> {
        let mut config = RencalConfig::load()?;
        config.theme = settings.into();
        config.save().map_err(RpcError::from)
    }

    pub async fn get_notifications_enabled(self) -> RpcResult<bool> {
        Ok(RencalConfig::load()?.notifications_enabled)
    }

    pub async fn set_notifications_enabled(self, enabled: bool) -> RpcResult<()> {
        let mut config = RencalConfig::load()?;
        config.notifications_enabled = enabled;
        config.save().map_err(RpcError::from)
    }

    pub async fn get_auto_sync_enabled(self) -> RpcResult<bool> {
        Ok(RencalConfig::load()?.auto_sync_enabled)
    }

    pub async fn set_auto_sync_enabled(self, enabled: bool) -> RpcResult<()> {
        let mut config = RencalConfig::load()?;
        config.auto_sync_enabled = enabled;
        config.save().map_err(RpcError::from)
    }

    pub async fn get_first_day_of_week(self) -> RpcResult<FirstDayOfWeek> {
        Ok(RencalConfig::load()?.first_day_of_week.into())
    }

    pub async fn set_first_day_of_week(self, day: FirstDayOfWeek) -> RpcResult<()> {
        let mut config = RencalConfig::load()?;
        config.first_day_of_week = day.into();
        config.save().map_err(RpcError::from)
    }

    pub async fn get_show_week_numbers(self) -> RpcResult<bool> {
        Ok(RencalConfig::load()?.show_week_numbers)
    }

    pub async fn set_show_week_numbers(self, show: bool) -> RpcResult<()> {
        let mut config = RencalConfig::load()?;
        config.show_week_numbers = show;
        config.save().map_err(RpcError::from)
    }

    pub async fn get_extra_time_zones(self) -> RpcResult<Vec<String>> {
        Ok(RencalConfig::load()?.extra_time_zones)
    }

    pub async fn set_extra_time_zones(self, mut zones: Vec<String>) -> RpcResult<()> {
        zones.truncate(MAX_EXTRA_TIME_ZONES);
        let mut config = RencalConfig::load()?;
        config.extra_time_zones = zones;
        config.save().map_err(RpcError::from)
    }

    pub async fn get_groups(self) -> RpcResult<BTreeMap<String, Vec<String>>> {
        Ok(RencalConfig::load()?.groups)
    }

    pub async fn set_groups(self, groups: BTreeMap<String, Vec<String>>) -> RpcResult<()> {
        let mut config = RencalConfig::load()?;
        config.groups = groups;
        config.save().map_err(RpcError::from)
    }
}
