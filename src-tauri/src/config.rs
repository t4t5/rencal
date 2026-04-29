//! renCal-specific user preferences at ~/.config/rencal/config.toml.
//!
//! Mirrors the get/save shape of caldir-core's `CaldirConfig`. Kept local to
//! renCal so we don't pollute caldir-core with app-specific settings.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

fn default_theme() -> String {
    "ren".to_string()
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RencalConfig {
    #[serde(default = "default_theme")]
    pub theme: String,
}

impl Default for RencalConfig {
    fn default() -> Self {
        Self {
            theme: default_theme(),
        }
    }
}

impl RencalConfig {
    pub fn config_path() -> Result<PathBuf, String> {
        let dir = dirs::config_dir()
            .ok_or_else(|| "Could not resolve user config directory".to_string())?
            .join("rencal");
        Ok(dir.join("config.toml"))
    }

    pub fn exists() -> bool {
        Self::config_path().map(|p| p.exists()).unwrap_or(false)
    }

    /// Infallible by design: missing or malformed file falls back to defaults
    /// so callers don't need an error path on every read.
    pub fn load() -> Self {
        let Ok(path) = Self::config_path() else {
            return Self::default();
        };
        let Ok(contents) = std::fs::read_to_string(&path) else {
            return Self::default();
        };
        toml::from_str(&contents).unwrap_or_default()
    }

    pub fn save(&self) -> Result<(), String> {
        let path = Self::config_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Could not create config directory: {e}"))?;
        }
        let contents =
            toml::to_string_pretty(self).map_err(|e| format!("Could not serialize config: {e}"))?;
        std::fs::write(&path, contents).map_err(|e| format!("Could not write config file: {e}"))
    }
}
