use std::path::PathBuf;
use std::time::Duration;

use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio::time::sleep;

pub const OMARCHY_THEME_CHANGED: &str = "omarchy-theme-changed";

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
pub struct OmarchyColors {
    pub background: String,
    pub foreground: String,
    pub accent: String,
    pub cursor: Option<String>,
    pub selection_foreground: Option<String>,
    pub selection_background: Option<String>,
    pub color0: String,
    pub color1: String,
    pub color2: String,
    pub color3: String,
    pub color4: String,
    pub color5: String,
    pub color6: String,
    pub color7: String,
    pub color8: String,
    pub color9: String,
    pub color10: String,
    pub color11: String,
    pub color12: String,
    pub color13: String,
    pub color14: String,
    pub color15: String,
}

fn omarchy_current_dir() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    Some(PathBuf::from(home).join(".config/omarchy/current"))
}

fn colors_toml_path() -> Option<PathBuf> {
    Some(omarchy_current_dir()?.join("theme/colors.toml"))
}

pub fn read_colors() -> Option<OmarchyColors> {
    let path = colors_toml_path()?;
    let contents = std::fs::read_to_string(path).ok()?;
    toml::from_str(&contents).ok()
}

/// Watches `~/.config/omarchy/current/` recursively and emits `OMARCHY_THEME_CHANGED`
/// whenever `colors.toml` is updated — including the atomic `rm -rf current/theme;
/// mv next-theme current/theme` swap performed by `omarchy-theme-set`.
pub async fn run_watcher(app: AppHandle) {
    let Some(watch_dir) = omarchy_current_dir() else {
        return;
    };
    if !watch_dir.exists() {
        eprintln!("Omarchy not detected at {watch_dir:?}; theme watcher disabled");
        return;
    }

    let (tx, mut rx) = mpsc::unbounded_channel::<()>();

    let mut watcher = match notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            if matches!(
                event.kind,
                EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
            ) {
                let _ = tx.send(());
            }
        }
    }) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("Failed to init Omarchy theme watcher: {e}");
            return;
        }
    };

    if let Err(e) = watcher.watch(&watch_dir, RecursiveMode::Recursive) {
        eprintln!("Failed to watch {watch_dir:?}: {e}");
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
