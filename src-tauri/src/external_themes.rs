//! User-supplied CSS themes loaded from the loose themes and plugin directories.
//! The frontend wraps each one in `[data-theme="<id>"] { … }` when injecting.

use crate::events::AppEvent;

use std::path::PathBuf;

use notify::RecursiveMode;
use rencal_config::RencalConfig;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;

use crate::fs_watch::{is_any_change, watch_debounced};
use crate::plugins::{self, Appearance};

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ExternalThemeSource {
    Loose,
    Plugin { id: String, version: String },
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
pub struct ExternalTheme {
    pub id: String,
    /// Loose themes use `@name` (or the filename as fallback).
    pub name: String,
    pub css: String,
    pub source: ExternalThemeSource,
    pub appearance: Option<Appearance>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
pub struct ExternalThemeError {
    pub package: String,
    pub message: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, Type)]
pub struct ExternalThemesSnapshot {
    pub themes: Vec<ExternalTheme>,
    pub errors: Vec<ExternalThemeError>,
}

fn themes_dir() -> Option<PathBuf> {
    RencalConfig::config_dir().ok().map(|d| d.join("themes"))
}

// Create ~/.config/rencal/themes/ if it doesn't exist
fn ensure_themes_dir() -> Option<PathBuf> {
    let dir = themes_dir()?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir).ok()?;
        write_readme(&dir);
    }
    Some(dir)
}

fn write_readme(dir: &std::path::Path) {
    let readme = r#"renCal custom themes
====================

Drop a .css file in this folder and it shows up in Settings > Themes.
The filename becomes the theme name (override with a `@name` comment).

A theme is a bare block of CSS variables — no selector needed:

    /* @name My Theme */
    --background: #0f1115;
    --foreground: #e6e6e6;
    --hover-tint: #ffffff;
    --primary: #7c8cff;
    --highlight: #7c8cff;

Setting --background, --foreground, --hover-tint and --primary gets you most
of a theme; hover/card/divider/etc. are derived automatically. Edits apply
live. See the full variable list in renCal's docs.
"#;
    let _ = std::fs::write(dir.join("README.txt"), readme);
}

/// Lowercase, collapse non-alphanumeric runs to single `-`, trim leading/trailing `-`.
fn slugify(input: &str) -> String {
    let mut out = String::new();
    for c in input.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    out
}

fn parse_name(css: &str, fallback: &str) -> String {
    if let Some(idx) = css.find("@name") {
        let rest = &css[idx + "@name".len()..];
        let line = rest.lines().next().unwrap_or("");
        let name = line.replace("*/", "");
        let name = name.trim();
        if !name.is_empty() {
            return name.to_string();
        }
    }
    fallback.to_string()
}

fn ensure_plugins_dir() -> Option<PathBuf> {
    let dir = plugins::plugins_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

fn scan_loose(dir: &std::path::Path) -> Vec<ExternalTheme> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut themes = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("css") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let slug = slugify(stem);
        if slug.is_empty() {
            continue;
        }
        let Ok(css) = std::fs::read_to_string(&path) else {
            continue;
        };
        themes.push(ExternalTheme {
            id: format!("user:{slug}"),
            name: parse_name(&css, stem),
            css,
            source: ExternalThemeSource::Loose,
            appearance: None,
        });
    }

    themes.sort_by_key(|t| t.name.to_lowercase());
    themes
}

fn scan_from(
    themes_dir: Option<&std::path::Path>,
    plugins_dir: Option<&std::path::Path>,
) -> ExternalThemesSnapshot {
    let mut snapshot = ExternalThemesSnapshot::default();
    if let Some(themes_dir) = themes_dir {
        snapshot.themes = scan_loose(themes_dir);
    }
    if let Some(plugins_dir) = plugins_dir {
        let packages = plugins::scan_packages(plugins_dir, plugins::running_app_version().as_ref());
        for package in packages.packages {
            for theme in package.themes {
                snapshot.themes.push(ExternalTheme {
                    id: theme.id,
                    name: theme.name,
                    css: theme.css,
                    source: ExternalThemeSource::Plugin {
                        id: package.id.clone(),
                        version: package.version.clone(),
                    },
                    appearance: Some(theme.appearance),
                });
            }
        }
        snapshot.errors = packages
            .errors
            .into_iter()
            .map(|error| ExternalThemeError {
                package: error.package,
                message: error.message,
            })
            .collect();
    }
    snapshot
        .themes
        .sort_by_key(|theme| theme.name.to_lowercase());
    snapshot
}

pub fn scan() -> ExternalThemesSnapshot {
    let themes_dir = ensure_themes_dir();
    let plugins_dir = ensure_plugins_dir();
    scan_from(themes_dir.as_deref(), plugins_dir.as_deref())
}

/// Watches loose themes and installed plugin packages, then emits one combined snapshot.
pub async fn run_watcher(app: AppHandle) {
    let (Some(themes_dir), Some(plugins_dir)) = (ensure_themes_dir(), ensure_plugins_dir()) else {
        return;
    };

    let mut watch = match watch_debounced(
        &[&themes_dir, &plugins_dir],
        RecursiveMode::Recursive,
        is_any_change,
    ) {
        Ok(watch) => watch,
        Err(err) => {
            log::warn!("theme watcher: failed to watch {themes_dir:?} and {plugins_dir:?}: {err}");
            return;
        }
    };

    while watch.changed().await.is_some() {
        let _ = AppEvent::ExternalThemesChanged(scan()).emit(&app);
    }
}

#[cfg(test)]
mod tests {
    use super::{ExternalThemeSource, parse_name, scan_from, slugify};

    const MANIFEST: &str = r#"
id = "alice.dusk"
name = "Dusk"
version = "1.0.0"
description = "A quiet theme"
min_rencal_version = "0.8.0"

[[contributes.themes]]
id = "dark"
name = "Dusk Dark"
css = "theme.css"
appearance = "dark"
"#;

    #[test]
    fn slugify_lowercases_and_collapses() {
        assert_eq!(slugify("Tokyo Night"), "tokyo-night");
        assert_eq!(slugify("My__Cool  Theme!!"), "my-cool-theme");
        assert_eq!(slugify("  spaced  "), "spaced");
        assert_eq!(slugify("already-slug"), "already-slug");
        assert_eq!(slugify("***"), "");
    }

    #[test]
    fn parse_name_reads_directive_else_fallback() {
        assert_eq!(
            parse_name("/* @name My Theme */\n--background: #000;", "file"),
            "My Theme"
        );
        assert_eq!(parse_name("--background: #000;", "file"), "file");
        // Trailing comment close is stripped, surrounding whitespace trimmed.
        assert_eq!(parse_name("/*@name   Solar  */", "file"), "Solar");
    }

    #[test]
    fn combined_scan_preserves_loose_themes_and_reports_bad_packages() {
        let temp = tempfile::tempdir().unwrap();
        let themes = temp.path().join("themes");
        let plugins = temp.path().join("plugins");
        std::fs::create_dir_all(&themes).unwrap();
        std::fs::create_dir_all(plugins.join("alice.dusk")).unwrap();
        std::fs::create_dir_all(plugins.join("bob.broken")).unwrap();
        std::fs::write(themes.join("local.css"), "--background: white;").unwrap();
        std::fs::write(plugins.join("alice.dusk/rencal-plugin.toml"), MANIFEST).unwrap();
        std::fs::write(plugins.join("alice.dusk/theme.css"), "--background: black;").unwrap();
        std::fs::write(plugins.join("bob.broken/rencal-plugin.toml"), "invalid").unwrap();

        let snapshot = scan_from(Some(&themes), Some(&plugins));

        assert_eq!(snapshot.themes.len(), 2);
        assert!(snapshot.themes.iter().any(|theme| {
            theme.id == "alice.dusk/dark"
                && matches!(theme.source, ExternalThemeSource::Plugin { .. })
        }));
        assert_eq!(snapshot.errors.len(), 1);
        assert_eq!(snapshot.errors[0].package, "bob.broken");
    }
}
