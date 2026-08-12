use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio::time::sleep;

pub const OMARCHY_THEME_CHANGED: &str = "omarchy-theme-changed";

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Type, PartialEq, Eq)]
pub enum OmarchyMode {
    #[serde(rename = "dark")]
    Dark,
    #[serde(rename = "light")]
    Light,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type, PartialEq, Eq)]
pub struct OmarchyColors {
    pub mode: OmarchyMode,
    pub background: String,
    pub foreground: String,
    pub bright_foreground: String,
    pub accent: String,
    pub red: String,
    pub green: String,
    pub yellow: String,
    pub blue: String,
}

fn candidate_dirs() -> Option<[PathBuf; 2]> {
    let home = dirs::home_dir()?;
    Some([
        home.join(".local/state/omarchy/current"),
        home.join(".config/omarchy/current"),
    ])
}

fn colors_toml_path() -> Option<PathBuf> {
    candidate_dirs()?
        .into_iter()
        .map(|dir| dir.join("theme/colors.toml"))
        .find(|path| path.is_file())
}

fn string_values(table: toml::Table) -> HashMap<String, String> {
    table
        .into_iter()
        .filter_map(|(key, value)| value.as_str().map(|value| (key, value.to_owned())))
        .collect()
}

fn first_value(colors: &HashMap<String, String>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| colors.get(*key).filter(|value| !value.is_empty()).cloned())
}

fn mode_from_background(background: &str) -> OmarchyMode {
    let Some(hex) = background.strip_prefix('#') else {
        return OmarchyMode::Dark;
    };
    if hex.len() != 6 {
        return OmarchyMode::Dark;
    }

    let components = [0, 2, 4].map(|start| u16::from_str_radix(&hex[start..start + 2], 16));
    match components {
        [Ok(red), Ok(green), Ok(blue)] if red + green + blue > 382 => OmarchyMode::Light,
        _ => OmarchyMode::Dark,
    }
}

fn resolve_mode(
    colors: &HashMap<String, String>,
    has_light_mode_marker: bool,
    background: &str,
) -> OmarchyMode {
    for key in ["mode", "theme_type"] {
        match colors.get(key).map(String::as_str) {
            Some("light") => return OmarchyMode::Light,
            Some("dark") => return OmarchyMode::Dark,
            _ => {}
        }
    }

    if has_light_mode_marker {
        OmarchyMode::Light
    } else {
        mode_from_background(background)
    }
}

fn resolve_colors(
    colors: &HashMap<String, String>,
    has_light_mode_marker: bool,
) -> Option<OmarchyColors> {
    let background = first_value(colors, &["background", "bg", "color0"])?;
    let foreground = first_value(colors, &["foreground", "fg", "color7"])?;
    let bright_foreground = first_value(
        colors,
        &["bright_foreground", "bright_fg", "cursor", "color15"],
    )
    .unwrap_or_else(|| foreground.clone());
    let accent =
        first_value(colors, &["accent", "color4", "blue"]).unwrap_or_else(|| foreground.clone());
    let red = first_value(colors, &["red", "color1"]).unwrap_or_else(|| accent.clone());
    let green = first_value(colors, &["green", "color2"]).unwrap_or_else(|| accent.clone());
    let yellow = first_value(colors, &["yellow", "color3"]).unwrap_or_else(|| accent.clone());
    let blue = first_value(colors, &["blue", "color4"]).unwrap_or_else(|| accent.clone());
    let mode = resolve_mode(colors, has_light_mode_marker, &background);

    Some(OmarchyColors {
        mode,
        background,
        foreground,
        bright_foreground,
        accent,
        red,
        green,
        yellow,
        blue,
    })
}

pub fn read_colors() -> Option<OmarchyColors> {
    let path = colors_toml_path()?;
    let contents = match std::fs::read_to_string(&path) {
        Ok(contents) => contents,
        Err(error) => {
            log::warn!("Failed to read Omarchy colors from {path:?}: {error}");
            return None;
        }
    };
    let table = match toml::from_str::<toml::Table>(&contents) {
        Ok(table) => table,
        Err(error) => {
            log::warn!("Failed to parse Omarchy colors from {path:?}: {error}");
            return None;
        }
    };
    let has_light_mode_marker = path
        .parent()
        .is_some_and(|theme_dir| theme_dir.join("light.mode").is_file());
    let resolved = resolve_colors(&string_values(table), has_light_mode_marker);
    if resolved.is_none() {
        log::warn!("Omarchy colors at {path:?} have no resolvable background or foreground");
    }
    resolved
}

/// Watches every existing Omarchy current-theme directory recursively and emits
/// `OMARCHY_THEME_CHANGED` whenever its contents change. This includes both the
/// v3 and quattro paths and their atomic next-theme swaps.
pub async fn run_watcher(app: AppHandle) {
    let Some(candidate_dirs) = candidate_dirs() else {
        return;
    };
    let watch_dirs: Vec<_> = candidate_dirs
        .into_iter()
        .filter(|dir| dir.exists())
        .collect();
    if watch_dirs.is_empty() {
        log::info!("Omarchy not detected; theme watcher disabled");
        return;
    }

    let (tx, mut rx) = mpsc::unbounded_channel::<()>();

    let mut watcher = match notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res
            && matches!(
                event.kind,
                EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
            )
        {
            let _ = tx.send(());
        }
    }) {
        Ok(watcher) => watcher,
        Err(error) => {
            log::warn!("Failed to init Omarchy theme watcher: {error}");
            return;
        }
    };

    let mut watched_any = false;
    for watch_dir in watch_dirs {
        match watcher.watch(&watch_dir, RecursiveMode::Recursive) {
            Ok(()) => watched_any = true,
            Err(error) => log::warn!("Failed to watch {watch_dir:?}: {error}"),
        }
    }
    if !watched_any {
        return;
    }

    while rx.recv().await.is_some() {
        // Coalesce the burst of events from the atomic rm-rf / mv swap.
        sleep(Duration::from_millis(150)).await;
        while rx.try_recv().is_ok() {}

        if let Some(colors) = read_colors() {
            let _ = app.emit(OMARCHY_THEME_CHANGED, colors);
        }
    }

    drop(watcher);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_fixture(contents: &str) -> HashMap<String, String> {
        string_values(toml::from_str::<toml::Table>(contents).unwrap())
    }

    #[test]
    fn resolves_quattro_canonical_colors() {
        let colors = resolve_colors(
            &parse_fixture(
                r##"
                mode = "dark"
                accent = "#7aa2f7"
                background = "#1a1b26"
                foreground = "#a9b1d6"
                bright_foreground = "#c0caf5"
                red = "#f7768e"
                green = "#9ece6a"
                yellow = "#e0af68"
                blue = "#7aa2f7"
                color1 = "#ignored"
                gradient_angle = 45
                "##,
            ),
            false,
        )
        .unwrap();

        assert_eq!(colors.mode, OmarchyMode::Dark);
        assert_eq!(colors.background, "#1a1b26");
        assert_eq!(colors.foreground, "#a9b1d6");
        assert_eq!(colors.bright_foreground, "#c0caf5");
        assert_eq!(colors.accent, "#7aa2f7");
        assert_eq!(colors.red, "#f7768e");
    }

    #[test]
    fn honors_quattro_light_mode() {
        let colors = resolve_colors(
            &parse_fixture(
                r##"
                mode = "light"
                background = "#FFFCF0"
                foreground = "#100F0F"
                accent = "#205EA6"
                "##,
            ),
            false,
        )
        .unwrap();

        assert_eq!(colors.mode, OmarchyMode::Light);
    }

    #[test]
    fn resolves_v3_full_palette() {
        let colors = resolve_colors(
            &parse_fixture(
                r##"
                background = "#1a1b26"
                foreground = "#a9b1d6"
                cursor = "#c0caf5"
                color0 = "#15161e"
                color1 = "#f7768e"
                color2 = "#9ece6a"
                color3 = "#e0af68"
                color4 = "#7aa2f7"
                color5 = "#bb9af7"
                color6 = "#7dcfff"
                color7 = "#a9b1d6"
                color8 = "#414868"
                color9 = "#f7768e"
                color10 = "#9ece6a"
                color11 = "#e0af68"
                color12 = "#7aa2f7"
                color13 = "#bb9af7"
                color14 = "#7dcfff"
                color15 = "#acb0d0"
                "##,
            ),
            false,
        )
        .unwrap();

        assert_eq!(colors.mode, OmarchyMode::Dark);
        assert_eq!(colors.bright_foreground, "#c0caf5");
        assert_eq!(colors.red, "#f7768e");
        assert_eq!(colors.green, "#9ece6a");
        assert_eq!(colors.yellow, "#e0af68");
        assert_eq!(colors.blue, "#7aa2f7");
    }

    #[test]
    fn resolves_alacritty_hybrid_palette() {
        let colors = resolve_colors(
            &parse_fixture(
                r##"
                accent = "#112233"
                selection = "#223344"
                background = "#101010"
                foreground = "#eeeeee"
                color0 = "#000000"
                color1 = "#aa0000"
                color2 = "#00aa00"
                color3 = "#aaaa00"
                color4 = "#0000aa"
                color7 = "#aaaaaa"
                color15 = "#ffffff"
                "##,
            ),
            false,
        )
        .unwrap();

        assert_eq!(colors.accent, "#112233");
        assert_eq!(colors.bright_foreground, "#ffffff");
        assert_eq!(colors.red, "#aa0000");
        assert_eq!(colors.blue, "#0000aa");
    }

    #[test]
    fn resolves_ansi_only_palette() {
        let colors = resolve_colors(
            &parse_fixture(
                r##"
                color0 = "#101010"
                color1 = "#aa0000"
                color2 = "#00aa00"
                color3 = "#aaaa00"
                color4 = "#0000aa"
                color5 = "#aa00aa"
                color6 = "#00aaaa"
                color7 = "#eeeeee"
                color8 = "#555555"
                color9 = "#ff0000"
                color10 = "#00ff00"
                color11 = "#ffff00"
                color12 = "#0000ff"
                color13 = "#ff00ff"
                color14 = "#00ffff"
                color15 = "#ffffff"
                "##,
            ),
            false,
        )
        .unwrap();

        assert_eq!(colors.background, "#101010");
        assert_eq!(colors.foreground, "#eeeeee");
        assert_eq!(colors.bright_foreground, "#ffffff");
        assert_eq!(colors.accent, "#0000aa");
    }

    #[test]
    fn rejects_palettes_without_background_or_foreground() {
        assert!(resolve_colors(&HashMap::new(), false).is_none());
        assert!(
            resolve_colors(
                &parse_fixture(
                    r##"
                    background = "#101010"
                    "##
                ),
                false,
            )
            .is_none()
        );
    }

    #[test]
    fn light_mode_marker_precedes_luminance() {
        let colors = resolve_colors(
            &parse_fixture(
                r##"
                background = "#101010"
                foreground = "#eeeeee"
                "##,
            ),
            true,
        )
        .unwrap();

        assert_eq!(colors.mode, OmarchyMode::Light);
    }

    #[test]
    #[ignore = "requires the local Omarchy quattro checkout"]
    fn resolves_all_quattro_themes() {
        let themes_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../omarchy/themes");
        let mut resolved_count = 0;

        for entry in std::fs::read_dir(&themes_dir).unwrap() {
            let colors_path = entry.unwrap().path().join("colors.toml");
            if !colors_path.is_file() {
                continue;
            }

            let contents = std::fs::read_to_string(&colors_path).unwrap();
            let colors = parse_fixture(&contents);
            assert!(
                resolve_colors(&colors, colors_path.with_file_name("light.mode").is_file())
                    .is_some(),
                "failed to resolve {colors_path:?}"
            );
            resolved_count += 1;
        }

        assert!(
            resolved_count > 0,
            "no quattro themes found in {themes_dir:?}"
        );
    }
}
