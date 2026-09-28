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

/// `System` shows the light or dark theme to match the OS; `Single` shows one theme.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    #[default]
    System,
    Single,
}

/// The theme mode and the themes it picks from. Switching mode keeps the others.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(default)]
pub struct ThemeConfig {
    pub mode: ThemeMode,
    pub single: String,
    pub light: String,
    pub dark: String,
}

impl Default for ThemeConfig {
    fn default() -> Self {
        Self {
            mode: ThemeMode::default(),
            single: "ren".to_string(),
            light: "ren-light".to_string(),
            dark: "ren".to_string(),
        }
    }
}

/// Before modes existed, `theme` was a single theme id.
fn deserialize_theme<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<ThemeConfig, D::Error> {
    // The table is parsed separately so its errors aren't hidden behind the untagged enum's.
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Repr {
        Legacy(String),
        Table(toml::Table),
    }
    match Repr::deserialize(deserializer)? {
        // Syncing with the system is how Omarchy's theme is followed now.
        Repr::Legacy(single) if single == "omarchy" => Ok(ThemeConfig::default()),
        Repr::Legacy(single) => Ok(ThemeConfig {
            mode: ThemeMode::Single,
            single,
            ..Default::default()
        }),
        Repr::Table(table) => toml::Value::Table(table)
            .try_into()
            .map_err(serde::de::Error::custom),
    }
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
    #[serde(default = "default_notifications_enabled")]
    pub notifications_enabled: bool,

    #[serde(default = "default_auto_sync_enabled")]
    pub auto_sync_enabled: bool,

    #[serde(default)]
    pub first_day_of_week: FirstDayOfWeek,

    #[serde(default)]
    pub show_week_numbers: bool,

    /// Tables must come AFTER top-level configs since they add a header:
    #[serde(default, deserialize_with = "deserialize_theme")]
    pub theme: ThemeConfig,

    #[serde(default)]
    pub groups: BTreeMap<String, Vec<String>>,
}

impl Default for RencalConfig {
    fn default() -> Self {
        Self {
            notifications_enabled: default_notifications_enabled(),
            auto_sync_enabled: default_auto_sync_enabled(),
            first_day_of_week: FirstDayOfWeek::default(),
            show_week_numbers: false,
            theme: ThemeConfig::default(),
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
    fn theme_defaults_to_ren_pair_following_the_system() {
        let config: RencalConfig = toml::from_str("").expect("parse");
        assert_eq!(config.theme, ThemeConfig::default());
        assert_eq!(config.theme.mode, ThemeMode::System);
        assert_eq!(config.theme.light, "ren-light");
        assert_eq!(config.theme.dark, "ren");
    }

    #[test]
    fn legacy_theme_string_becomes_single_theme() {
        let config: RencalConfig = toml::from_str("theme = \"nord\"").expect("parse");
        assert_eq!(
            config.theme,
            ThemeConfig {
                mode: ThemeMode::Single,
                single: "nord".into(),
                ..Default::default()
            }
        );
    }

    #[test]
    fn legacy_omarchy_theme_syncs_with_the_system() {
        let config: RencalConfig = toml::from_str("theme = \"omarchy\"").expect("parse");
        assert_eq!(config.theme, ThemeConfig::default());
    }

    #[test]
    fn theme_table_round_trips_after_scalar_keys() {
        let config = RencalConfig {
            theme: ThemeConfig {
                mode: ThemeMode::Single,
                single: "omarchy".into(),
                light: "gruvbox:light".into(),
                dark: "user:mine".into(),
            },
            ..Default::default()
        };
        let toml_str = toml::to_string_pretty(&config).expect("serialize");
        assert!(toml_str.contains("[theme]"));
        let theme_at = toml_str.find("[theme]").unwrap();
        assert!(toml_str.find("show_week_numbers").unwrap() < theme_at);
        let reparsed: RencalConfig = toml::from_str(&toml_str).expect("re-parse");
        assert_eq!(reparsed.theme, config.theme);
    }

    #[test]
    fn partial_theme_table_falls_back_to_defaults() {
        let config: RencalConfig =
            toml::from_str("[theme]\nmode = \"single\"\ndark = \"nord\"").expect("parse");
        assert_eq!(
            config.theme,
            ThemeConfig {
                mode: ThemeMode::Single,
                dark: "nord".into(),
                ..Default::default()
            }
        );
    }

    #[test]
    fn invalid_theme_table_reports_the_field_error() {
        let error = toml::from_str::<RencalConfig>("[theme]\nmode = \"dark\"")
            .err()
            .expect("unknown mode is rejected")
            .to_string();
        assert!(error.contains("unknown variant `dark`"), "{error}");
    }

    #[test]
    fn missing_config_file_falls_back_to_defaults() {
        let path = std::env::temp_dir().join(format!(
            "rencal-config-missing-{}-{}.toml",
            std::process::id(),
            std::thread::current().name().unwrap_or("unnamed")
        ));

        let config = RencalConfig::load_from_path(&path).expect("load missing config");

        assert_eq!(config.theme, ThemeConfig::default());
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
