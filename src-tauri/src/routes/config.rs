use crate::routes::error::RpcError;
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

// `get_theme` returns `Some(theme)` if the config file exists, `None` if it
// has never been written. The frontend uses the `None` case to write its
// cached theme settings up to TOML on first run.
#[taurpc::procedures(path = "config", export_to = "../src/rpc/bindings.ts")]
pub trait ConfigApi {
    async fn get_theme() -> TauResult<Option<ThemeSettings>>;
    async fn set_theme(settings: ThemeSettings) -> TauResult<()>;
    async fn get_notifications_enabled() -> TauResult<bool>;
    async fn set_notifications_enabled(enabled: bool) -> TauResult<()>;
    async fn get_auto_sync_enabled() -> TauResult<bool>;
    async fn set_auto_sync_enabled(enabled: bool) -> TauResult<()>;
    async fn get_first_day_of_week() -> TauResult<FirstDayOfWeek>;
    async fn set_first_day_of_week(day: FirstDayOfWeek) -> TauResult<()>;
    async fn get_show_week_numbers() -> TauResult<bool>;
    async fn set_show_week_numbers(show: bool) -> TauResult<()>;
    async fn get_groups() -> TauResult<BTreeMap<String, Vec<String>>>;
    async fn set_groups(groups: BTreeMap<String, Vec<String>>) -> TauResult<()>;
}

#[derive(Clone)]
pub struct ConfigApiImpl;

#[taurpc::resolvers]
impl ConfigApi for ConfigApiImpl {
    async fn get_theme(self) -> TauResult<Option<ThemeSettings>> {
        if !RencalConfig::exists() {
            return Ok(None);
        }
        Ok(Some(RencalConfig::load()?.theme.into()))
    }

    async fn set_theme(self, settings: ThemeSettings) -> TauResult<()> {
        let mut config = RencalConfig::load()?;
        config.theme = settings.into();
        config.save().map_err(RpcError::from)
    }

    async fn get_notifications_enabled(self) -> TauResult<bool> {
        Ok(RencalConfig::load()?.notifications_enabled)
    }

    async fn set_notifications_enabled(self, enabled: bool) -> TauResult<()> {
        let mut config = RencalConfig::load()?;
        config.notifications_enabled = enabled;
        config.save().map_err(RpcError::from)
    }

    async fn get_auto_sync_enabled(self) -> TauResult<bool> {
        Ok(RencalConfig::load()?.auto_sync_enabled)
    }

    async fn set_auto_sync_enabled(self, enabled: bool) -> TauResult<()> {
        let mut config = RencalConfig::load()?;
        config.auto_sync_enabled = enabled;
        config.save().map_err(RpcError::from)
    }

    async fn get_first_day_of_week(self) -> TauResult<FirstDayOfWeek> {
        Ok(RencalConfig::load()?.first_day_of_week.into())
    }

    async fn set_first_day_of_week(self, day: FirstDayOfWeek) -> TauResult<()> {
        let mut config = RencalConfig::load()?;
        config.first_day_of_week = day.into();
        config.save().map_err(RpcError::from)
    }

    async fn get_show_week_numbers(self) -> TauResult<bool> {
        Ok(RencalConfig::load()?.show_week_numbers)
    }

    async fn set_show_week_numbers(self, show: bool) -> TauResult<()> {
        let mut config = RencalConfig::load()?;
        config.show_week_numbers = show;
        config.save().map_err(RpcError::from)
    }

    async fn get_groups(self) -> TauResult<BTreeMap<String, Vec<String>>> {
        Ok(RencalConfig::load()?.groups)
    }

    async fn set_groups(self, groups: BTreeMap<String, Vec<String>>) -> TauResult<()> {
        let mut config = RencalConfig::load()?;
        config.groups = groups;
        config.save().map_err(RpcError::from)
    }
}
