//! Theme format v2 files (`GPUI_PORT_PLAN.md` §4.7) in
//! `~/.config/rencal/themes/*.json`, for the GPUI app. Each file is a theme
//! family; a broken file or key is reported, never fatal. The Tauri app reads
//! the CSS themes in the same directory through `external_themes`.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use notify::RecursiveMode;
use rencal_theme::{Theme, ThemeFamily, slugify, variant_ids};

use crate::fs_watch::{is_any_change, watch_debounced};

/// One variant of a user theme family.
#[derive(Clone, Debug, PartialEq)]
pub struct UserTheme {
    /// `user:<slug>`: the file stem for a one-variant family, else the variant name.
    pub id: String,
    pub file: PathBuf,
    pub theme: Theme,
}

/// A problem with one file or key. The rest of the file still loads.
#[derive(Clone, Debug, PartialEq)]
pub struct UserThemeDiagnostic {
    pub file: PathBuf,
    pub message: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct UserThemesSnapshot {
    /// Sorted by name.
    pub themes: Vec<UserTheme>,
    pub diagnostics: Vec<UserThemeDiagnostic>,
}

pub fn themes_dir() -> Option<PathBuf> {
    crate::external_themes::themes_dir()
}

pub fn scan() -> UserThemesSnapshot {
    themes_dir().map(|dir| scan_dir(&dir)).unwrap_or_default()
}

pub fn scan_dir(dir: &Path) -> UserThemesSnapshot {
    let mut snapshot = UserThemesSnapshot::default();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return snapshot;
    };
    let mut files: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
    // Stable ids when two files slugify alike: the first in name order wins.
    files.sort();

    let mut ids = HashSet::new();
    for file in files {
        let mut report = |message: String| {
            snapshot.diagnostics.push(UserThemeDiagnostic {
                file: file.clone(),
                message,
            });
        };
        match file.extension().and_then(|ext| ext.to_str()) {
            Some("json") => {}
            Some("css") => {
                report(
                    "CSS themes are not read by this version of renCal; convert it to a JSON theme"
                        .into(),
                );
                continue;
            }
            _ => continue,
        }
        let Some(stem) = file.file_stem().and_then(|stem| stem.to_str()).map(slugify) else {
            continue;
        };
        if stem.is_empty() {
            continue;
        }
        let json = match std::fs::read_to_string(&file) {
            Ok(json) => json,
            Err(error) => {
                report(format!("could not read the file: {error}"));
                continue;
            }
        };
        let family = match ThemeFamily::from_json(&json) {
            Ok(family) => family,
            Err(error) => {
                report(format!("invalid theme file: {error}"));
                continue;
            }
        };
        if family.themes.is_empty() {
            report("the file has no themes".into());
            continue;
        }
        for (slug, content) in variant_ids(&stem, &family).into_iter().zip(&family.themes) {
            let id = format!("user:{slug}");
            if !ids.insert(id.clone()) {
                report(format!("`{}` repeats the theme id {id}", content.name));
                continue;
            }
            let (theme, diagnostics) = content.compile();
            for diagnostic in diagnostics {
                report(diagnostic.to_string());
            }
            snapshot.themes.push(UserTheme {
                id,
                file: file.clone(),
                theme,
            });
        }
    }
    snapshot
        .themes
        .sort_by_key(|theme| theme.theme.name.to_lowercase());
    snapshot
}

/// Reports a fresh snapshot whenever a file in the themes directory changes.
pub async fn run_watcher(on_change: impl Fn(UserThemesSnapshot) + Send + 'static) {
    let Some(dir) = themes_dir() else {
        return;
    };
    if let Err(err) = std::fs::create_dir_all(&dir) {
        log::warn!("user theme watcher: cannot create {dir:?}: {err}");
        return;
    }
    let mut watch = match watch_debounced(&[&dir], RecursiveMode::NonRecursive, is_any_change) {
        Ok(watch) => watch,
        Err(err) => {
            log::warn!("user theme watcher: failed to watch {dir:?}: {err}");
            return;
        }
    };
    while watch.changed().await.is_some() {
        on_change(scan_dir(&dir));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ONE: &str = r##"{
        "name": "Dusk",
        "themes": [{ "name": "Dusk", "appearance": "dark", "style": { "primary": "#ff0000" } }]
    }"##;

    const TWO: &str = r##"{
        "name": "Paper",
        "themes": [
            { "name": "Paper Light", "appearance": "light", "style": {} },
            { "name": "Paper Dark", "appearance": "dark", "style": { "nope": 1 } }
        ]
    }"##;

    fn ids(snapshot: &UserThemesSnapshot) -> Vec<&str> {
        snapshot
            .themes
            .iter()
            .map(|theme| theme.id.as_str())
            .collect()
    }

    #[test]
    fn names_one_variant_by_file_and_several_by_variant() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("My Dusk.json"), ONE).unwrap();
        std::fs::write(dir.path().join("paper.json"), TWO).unwrap();

        let snapshot = scan_dir(dir.path());

        assert_eq!(
            ids(&snapshot),
            ["user:my-dusk", "user:paper-dark", "user:paper-light"]
        );
        assert_eq!(snapshot.diagnostics.len(), 1, "{:?}", snapshot.diagnostics);
        assert!(snapshot.diagnostics[0].message.contains("nope"));
    }

    #[test]
    fn reports_css_and_broken_files_and_skips_the_rest() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("old.css"), "--background: #000;").unwrap();
        std::fs::write(dir.path().join("broken.json"), "{").unwrap();
        std::fs::write(dir.path().join("README.txt"), "hi").unwrap();
        std::fs::write(dir.path().join("dusk.json"), ONE).unwrap();

        let snapshot = scan_dir(dir.path());

        assert_eq!(ids(&snapshot), ["user:dusk"]);
        let files: Vec<_> = snapshot
            .diagnostics
            .iter()
            .map(|d| d.file.file_name().unwrap().to_str().unwrap())
            .collect();
        assert_eq!(files, ["broken.json", "old.css"]);
    }

    #[test]
    fn a_repeated_id_keeps_the_first_file() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("dusk.json"), ONE).unwrap();
        std::fs::write(dir.path().join("Dusk!.json"), ONE).unwrap();

        let snapshot = scan_dir(dir.path());

        assert_eq!(ids(&snapshot), ["user:dusk"]);
        assert_eq!(
            snapshot.themes[0].file.file_name().unwrap(),
            "Dusk!.json",
            "files are read in path order"
        );
        assert_eq!(snapshot.diagnostics.len(), 1);
    }

    #[test]
    fn a_missing_directory_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            scan_dir(&dir.path().join("nope")),
            UserThemesSnapshot::default()
        );
    }
}
