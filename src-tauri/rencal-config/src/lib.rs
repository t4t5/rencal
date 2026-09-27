//! renCal-specific user preferences at ~/.config/rencal/config.toml.
//!
//! Lives in its own workspace crate so both the Tauri app and the standalone
//! `rencal-notifierd` daemon (via `reminder-core`) can read/write the same
//! file without dragging Tauri/taurpc into a long-lived systemd service.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("Could not resolve user config directory")]
    PathResolution,
    #[error("Could not read config file {path}: {source}")]
    Read {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("Could not parse config file {path}: {source}")]
    Parse {
        path: PathBuf,
        source: toml::de::Error,
    },
    #[error("Could not serialize config: {0}")]
    Serialize(#[source] toml::ser::Error),
    #[error("Could not write config at {path}: {source}")]
    Write {
        path: PathBuf,
        source: std::io::Error,
    },
}

fn default_theme() -> String {
    "ren".to_string()
}

fn default_notifications_enabled() -> bool {
    true
}

fn default_auto_sync_enabled() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum FirstDayOfWeek {
    #[default]
    Monday,
    Sunday,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RencalConfig {
    #[serde(default = "default_theme")]
    pub theme: String,

    #[serde(default = "default_notifications_enabled")]
    pub notifications_enabled: bool,

    #[serde(default = "default_auto_sync_enabled")]
    pub auto_sync_enabled: bool,

    #[serde(default)]
    pub first_day_of_week: FirstDayOfWeek,

    #[serde(default)]
    pub show_week_numbers: bool,

    /// Must come AFTER top-level configs since it adds [groups] table header:
    #[serde(default)]
    pub groups: BTreeMap<String, Vec<String>>,
}

impl Default for RencalConfig {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            notifications_enabled: default_notifications_enabled(),
            auto_sync_enabled: default_auto_sync_enabled(),
            first_day_of_week: FirstDayOfWeek::default(),
            show_week_numbers: false,
            groups: BTreeMap::new(),
        }
    }
}

impl RencalConfig {
    /// ~/.config/rencal
    pub fn config_dir() -> Result<PathBuf, ConfigError> {
        dirs::config_dir()
            .ok_or(ConfigError::PathResolution)
            .map(|d| d.join("rencal"))
    }

    pub fn config_path() -> Result<PathBuf, ConfigError> {
        Ok(Self::config_dir()?.join("config.toml"))
    }

    pub fn exists() -> bool {
        Self::config_path().map(|p| p.exists()).unwrap_or(false)
    }

    /// A missing file means the user has not configured renCal yet. Existing
    /// files must be readable and valid so callers never overwrite a broken
    /// config with defaults.
    pub fn load() -> Result<Self, ConfigError> {
        Self::load_from_path(&Self::config_path()?)
    }

    fn load_from_path(path: &Path) -> Result<Self, ConfigError> {
        let contents = match std::fs::read_to_string(path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Self::default());
            }
            Err(error) => {
                return Err(ConfigError::Read {
                    path: path.to_owned(),
                    source: error,
                });
            }
        };

        toml::from_str(&contents).map_err(|source| ConfigError::Parse {
            path: path.to_owned(),
            source,
        })
    }

    pub fn save(&self) -> Result<(), ConfigError> {
        let path = Self::config_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|source| ConfigError::Write {
                path: parent.to_owned(),
                source,
            })?;
        }
        let contents = toml::to_string_pretty(self).map_err(ConfigError::Serialize)?;
        std::fs::write(&path, contents).map_err(|source| ConfigError::Write { path, source })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_with_valid_toml_field_ordering() {
        let mut config = RencalConfig {
            auto_sync_enabled: false,
            ..Default::default()
        };

        config
            .groups
            .insert("work".to_string(), vec!["work-cal".to_string()]);

        let toml_str = toml::to_string_pretty(&config).expect("serialize");
        let reparsed: RencalConfig = toml::from_str(&toml_str).expect("re-parse");

        assert!(!reparsed.auto_sync_enabled);
        assert_eq!(
            reparsed.groups.get("work"),
            Some(&vec!["work-cal".to_string()])
        );
    }

    #[test]
    fn missing_groups_falls_back_to_empty() {
        let config: RencalConfig = toml::from_str("theme = \"ren\"").expect("parse");
        assert!(config.groups.is_empty());
    }

    #[test]
    fn first_day_of_week_defaults_to_monday_and_round_trips() {
        let config: RencalConfig = toml::from_str("theme = \"ren\"").expect("parse");
        assert_eq!(config.first_day_of_week, FirstDayOfWeek::Monday);

        let config = RencalConfig {
            first_day_of_week: FirstDayOfWeek::Sunday,
            ..Default::default()
        };
        let toml_str = toml::to_string_pretty(&config).expect("serialize");
        assert!(toml_str.contains("first_day_of_week = \"sunday\""));
        let reparsed: RencalConfig = toml::from_str(&toml_str).expect("re-parse");
        assert_eq!(reparsed.first_day_of_week, FirstDayOfWeek::Sunday);
    }

    #[test]
    fn show_week_numbers_defaults_to_false_and_round_trips() {
        let config: RencalConfig = toml::from_str("theme = \"ren\"").expect("parse");
        assert!(!config.show_week_numbers);

        let config = RencalConfig {
            show_week_numbers: true,
            ..Default::default()
        };
        let toml_str = toml::to_string_pretty(&config).expect("serialize");
        assert!(toml_str.contains("show_week_numbers = true"));
        let reparsed: RencalConfig = toml::from_str(&toml_str).expect("re-parse");
        assert!(reparsed.show_week_numbers);
    }

    #[test]
    fn missing_config_file_falls_back_to_defaults() {
        let path = std::env::temp_dir().join(format!(
            "rencal-config-missing-{}-{}.toml",
            std::process::id(),
            std::thread::current().name().unwrap_or("unnamed")
        ));

        let config = RencalConfig::load_from_path(&path).expect("load missing config");

        assert_eq!(config.theme, default_theme());
        assert!(config.groups.is_empty());
    }

    #[test]
    fn malformed_config_file_returns_an_error() {
        let path = std::env::temp_dir().join(format!(
            "rencal-config-malformed-{}-{}.toml",
            std::process::id(),
            std::thread::current().name().unwrap_or("unnamed")
        ));
        std::fs::write(&path, "theme = [not valid TOML").expect("write malformed config");

        let error = match RencalConfig::load_from_path(&path) {
            Ok(_) => panic!("malformed config was accepted"),
            Err(error) => error,
        };

        assert!(matches!(error, ConfigError::Parse { .. }));
        assert_eq!(
            std::fs::read_to_string(&path).expect("read malformed config"),
            "theme = [not valid TOML"
        );

        std::fs::remove_file(path).expect("remove malformed config");
    }
}
