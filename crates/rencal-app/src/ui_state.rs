//! `UiState` (GPUI_PORT_PLAN.md §3.3): window-level choices that outlive a
//! session but are not settings, persisted as JSON in the XDG state dir
//! (`~/.local/state/rencal/ui.json`). The old app kept these in `localStorage`.
//! A missing or corrupt file, or a bad field, means defaults.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use gpui_kit::{App, Global};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::runtime::Tokio;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(default)]
pub struct UiState {
    /// The main view's id (`month`, `week`, `board`). An id, not an enum, so
    /// the view registry stays open (§0); unknown ids fall back to the default.
    pub calendar_view: String,
    pub sidebar_collapsed: bool,
    /// The calendar group the main views show.
    pub active_group: String,
}

impl Default for UiState {
    fn default() -> Self {
        Self {
            calendar_view: "month".into(),
            sidebar_collapsed: false,
            active_group: "default".into(),
        }
    }
}

impl Global for UiState {}

/// Where `UiState` saves; `None` keeps it in memory (tests).
struct UiStateFile(Option<PathBuf>);

impl Global for UiStateFile {}

impl UiState {
    pub fn global(cx: &App) -> &Self {
        cx.global::<Self>()
    }

    /// Loads the saved state and installs it.
    pub fn init(cx: &mut App) {
        let path = path();
        let state = path.as_deref().map(load_from).unwrap_or_default();
        Self::init_with(state, path, cx);
    }

    pub fn init_with(state: UiState, file: Option<PathBuf>, cx: &mut App) {
        cx.set_global(state);
        cx.set_global(UiStateFile(file));
    }

    /// Applies `edit` and saves in the background when it changed anything.
    pub fn update(cx: &mut App, edit: impl FnOnce(&mut UiState)) {
        let mut next = Self::global(cx).clone();
        edit(&mut next);
        if next == *Self::global(cx) {
            return;
        }
        cx.set_global(next.clone());
        let Some(path) = cx.global::<UiStateFile>().0.clone() else {
            return;
        };
        // Saves run on a thread pool; a save that lost the race to a newer
        // one is skipped so the file always ends at the latest state.
        static NEXT: AtomicU64 = AtomicU64::new(0);
        static SAVED: Mutex<u64> = Mutex::new(0);
        let generation = NEXT.fetch_add(1, Ordering::Relaxed) + 1;
        Tokio::spawn_blocking(cx, move || {
            let mut saved = SAVED.lock();
            if generation < *saved {
                return;
            }
            if let Err(err) = save_to(&path, &next) {
                log::warn!("could not save {path:?}: {err}");
            }
            *saved = generation;
        });
    }
}

fn path() -> Option<PathBuf> {
    // macOS has no XDG state dir.
    dirs::state_dir()
        .or_else(dirs::data_local_dir)
        .map(|dir| dir.join("rencal/ui.json"))
}

fn load_from(path: &Path) -> UiState {
    let Ok(json) = std::fs::read_to_string(path) else {
        return UiState::default();
    };
    // Field by field, so one bad value keeps the others.
    let Ok(serde_json::Value::Object(fields)) = serde_json::from_str(&json) else {
        log::warn!("{path:?} is not a JSON object; using defaults");
        return UiState::default();
    };
    let mut state = serde_json::to_value(UiState::default()).expect("UiState serialises");
    for (key, value) in fields {
        let mut candidate = state.clone();
        candidate[&key] = value;
        if serde_json::from_value::<UiState>(candidate.clone()).is_ok() {
            state = candidate;
        } else {
            log::warn!("{path:?}: ignoring invalid `{key}`");
        }
    }
    serde_json::from_value(state).unwrap_or_default()
}

fn save_to(path: &Path, state: &UiState) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let json = serde_json::to_string_pretty(state).expect("UiState serialises");
    // Write then rename, so a crash mid-write never leaves a torn file.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/ui.json");
        let state = UiState {
            calendar_view: "week".into(),
            sidebar_collapsed: true,
            active_group: "work".into(),
        };
        save_to(&path, &state).unwrap();
        assert_eq!(load_from(&path), state);
    }

    #[test]
    fn missing_or_corrupt_files_mean_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ui.json");
        assert_eq!(load_from(&path), UiState::default());
        std::fs::write(&path, "{ nope").unwrap();
        assert_eq!(load_from(&path), UiState::default());
    }

    #[test]
    fn a_bad_field_keeps_the_others() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ui.json");
        std::fs::write(
            &path,
            r#"{ "calendar_view": "week", "sidebar_collapsed": "yes", "extra": 1 }"#,
        )
        .unwrap();
        assert_eq!(
            load_from(&path),
            UiState {
                calendar_view: "week".into(),
                ..Default::default()
            }
        );
    }
}
