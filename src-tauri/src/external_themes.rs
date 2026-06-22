//! User-supplied CSS themes loaded from `~/.config/rencal/themes/`.
//!
//! Each `*.css` file in that directory becomes a selectable theme. The file
//! holds a bare block of CSS custom-property declarations (no selector); the
//! frontend wraps it in `[data-theme="user:<slug>"] { … }` when injecting, so
//! authors never write the scoping selector themselves. This mirrors the
//! Omarchy pipeline (see `crate::omarchy`): scan on demand, watch the dir, and
//! emit on change so added/edited themes show up live.

use std::path::PathBuf;
use std::time::Duration;

use notify::{Event, EventKind, RecursiveMode, Watcher};
use rencal_config::RencalConfig;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio::time::sleep;

pub const EXTERNAL_THEMES_CHANGED: &str = "external-themes-changed";

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
pub struct ExternalTheme {
    /// Stable id, namespaced to avoid colliding with built-in themes.
    pub id: String,
    /// Display name from an optional `@name` comment directive, else the filename.
    pub name: String,
    /// Raw file contents (a bare declaration block, no selector).
    pub css: String,
}

fn themes_dir() -> Option<PathBuf> {
    RencalConfig::config_dir().ok().map(|d| d.join("themes"))
}

/// Resolve the themes dir, creating it if missing so users have somewhere to
/// drop files and the watcher has a directory to watch. Best-effort.
fn ensure_themes_dir() -> Option<PathBuf> {
    let dir = themes_dir()?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir).ok()?;
        write_readme(&dir);
    }
    Some(dir)
}

/// Drop a README so first-time users see the expected format.
fn write_readme(dir: &std::path::Path) {
    let readme = "renCal custom themes\n====================\n\nDrop a .css file in this folder and it shows up in Settings > Themes.\nThe filename becomes the theme name (override with a `@name` comment).\n\nA theme is a bare block of CSS variables — no selector needed:\n\n    /* @name My Theme */\n    --background: #0f1115;\n    --foreground: #e6e6e6;\n    --hover-tint: #ffffff;\n    --primary: #7c8cff;\n    --highlight: #7c8cff;\n\nSetting --background, --foreground, --hover-tint and --primary gets you most\nof a theme; hover/card/divider/etc. are derived automatically. Edits apply\nlive. See the full variable list in renCal's docs.\n";
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

/// Pull a display name from a leading `@name <value>` directive in a comment,
/// falling back to the provided default.
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

pub fn scan() -> Vec<ExternalTheme> {
    let Some(dir) = ensure_themes_dir() else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
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
        });
    }

    themes.sort_by_key(|t| t.name.to_lowercase());
    themes
}

/// Watches `~/.config/rencal/themes/` and emits `EXTERNAL_THEMES_CHANGED` with
/// the full theme list whenever a file is added, edited, or removed.
pub async fn run_watcher(app: AppHandle) {
    let Some(watch_dir) = ensure_themes_dir() else {
        return;
    };

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
        Ok(w) => w,
        Err(e) => {
            log::warn!("Failed to init theme watcher: {e}");
            return;
        }
    };

    if let Err(e) = watcher.watch(&watch_dir, RecursiveMode::NonRecursive) {
        log::warn!("Failed to watch {watch_dir:?}: {e}");
        return;
    }

    while rx.recv().await.is_some() {
        // Coalesce editor save bursts.
        sleep(Duration::from_millis(150)).await;
        while rx.try_recv().is_ok() {}

        let _ = app.emit(EXTERNAL_THEMES_CHANGED, scan());
    }

    drop(watcher);
}

#[cfg(test)]
mod tests {
    use super::{parse_name, slugify};

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
}
