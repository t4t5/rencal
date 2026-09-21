//! User-supplied CSS themes loaded from the loose themes and plugin directories.
//! The frontend wraps each one in `[data-theme="<id>"] { … }` when injecting.

use crate::events::AppEvent;

use std::path::{Path, PathBuf};

use base64::Engine;
use notify::RecursiveMode;
use rencal_config::RencalConfig;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;

use crate::fs_watch::{is_any_change, watch_debounced};
use crate::plugins::{self, Appearance, FontStyle, MANIFEST_FILE};

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

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
pub struct ExternalThemeFont {
    pub family: String,
    pub weight: u16,
    pub style: FontStyle,
    pub data: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, Type)]
pub struct ExternalThemeFonts {
    pub fonts: Vec<ExternalThemeFont>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ExternalThemeFontErrorKind {
    InvalidInput,
    InvalidPackage,
    Io,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExternalThemeFontError {
    pub kind: ExternalThemeFontErrorKind,
    message: String,
}

impl ExternalThemeFontError {
    fn new(kind: ExternalThemeFontErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for ExternalThemeFontError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for ExternalThemeFontError {}

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

fn declares_custom_property(css: &str, property: &str) -> bool {
    let bytes = css.as_bytes();
    let property = property.as_bytes();
    let mut index = 0;
    let mut in_comment = false;

    while index < bytes.len() {
        if in_comment {
            if bytes[index..].starts_with(b"*/") {
                in_comment = false;
                index += 2;
            } else {
                index += 1;
            }
            continue;
        }
        if bytes[index..].starts_with(b"/*") {
            in_comment = true;
            index += 2;
            continue;
        }
        if bytes[index..].starts_with(property) {
            let mut end = index + property.len();
            while end < bytes.len() && bytes[end].is_ascii_whitespace() {
                end += 1;
            }
            if bytes.get(end) == Some(&b':') {
                return true;
            }
        }
        index += 1;
    }
    false
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
    for theme in &snapshot.themes {
        if declares_custom_property(&theme.css, "--muted")
            && !declares_custom_property(&theme.css, "--muted-foreground")
        {
            let package = match &theme.source {
                ExternalThemeSource::Loose => theme.id.clone(),
                ExternalThemeSource::Plugin { id, .. } => id.clone(),
            };
            snapshot.errors.push(ExternalThemeError {
                package,
                message: format!(
                    "Theme {:?} uses the removed --muted text token; rename it to --muted-foreground",
                    theme.name
                ),
            });
        }
    }
    snapshot
}

pub fn scan() -> ExternalThemesSnapshot {
    let themes_dir = ensure_themes_dir();
    let plugins_dir = ensure_plugins_dir();
    scan_from(themes_dir.as_deref(), plugins_dir.as_deref())
}

pub fn load_fonts(theme_id: &str) -> Result<ExternalThemeFonts, ExternalThemeFontError> {
    if theme_id.starts_with("user:") {
        return Ok(ExternalThemeFonts::default());
    }
    let root = plugins::plugins_dir().map_err(|error| {
        ExternalThemeFontError::new(ExternalThemeFontErrorKind::Io, error.to_string())
    })?;
    load_fonts_from(&root, theme_id)
}

fn load_fonts_from(
    plugins_root: &Path,
    theme_id: &str,
) -> Result<ExternalThemeFonts, ExternalThemeFontError> {
    if theme_id.starts_with("user:") {
        return Ok(ExternalThemeFonts::default());
    }
    let Some((package_id, contribution_id)) = theme_id.split_once('/') else {
        return Err(ExternalThemeFontError::new(
            ExternalThemeFontErrorKind::InvalidInput,
            format!("external theme id {theme_id:?} is not a plugin theme"),
        ));
    };
    if contribution_id.contains('/') {
        return Err(ExternalThemeFontError::new(
            ExternalThemeFontErrorKind::InvalidInput,
            format!("external theme id {theme_id:?} is invalid"),
        ));
    }
    plugins::validate_package_id(package_id).map_err(|error| {
        ExternalThemeFontError::new(ExternalThemeFontErrorKind::InvalidInput, error.to_string())
    })?;

    let package_dir = plugins_root.join(package_id);
    let canonical_package = std::fs::canonicalize(&package_dir).map_err(|error| {
        ExternalThemeFontError::new(
            ExternalThemeFontErrorKind::Io,
            format!("could not resolve {}: {error}", package_dir.display()),
        )
    })?;
    let manifest_path = canonical_package.join(MANIFEST_FILE);
    let contents = std::fs::read_to_string(&manifest_path).map_err(|error| {
        ExternalThemeFontError::new(
            ExternalThemeFontErrorKind::Io,
            format!("could not read {}: {error}", manifest_path.display()),
        )
    })?;
    let app_version = plugins::running_app_version();
    let manifest =
        plugins::validate_manifest(&contents, app_version.as_ref()).map_err(|error| {
            ExternalThemeFontError::new(
                ExternalThemeFontErrorKind::InvalidPackage,
                error.to_string(),
            )
        })?;
    if manifest.id != package_id
        || !manifest
            .contributes
            .themes
            .iter()
            .any(|theme| theme.id == contribution_id)
    {
        return Err(ExternalThemeFontError::new(
            ExternalThemeFontErrorKind::InvalidInput,
            format!("plugin theme {theme_id:?} is not installed"),
        ));
    }

    let mut fonts = Vec::with_capacity(manifest.contributes.fonts.len());
    for font in manifest.contributes.fonts {
        let path = canonical_package.join(&font.file);
        let canonical = std::fs::canonicalize(&path).map_err(|error| {
            ExternalThemeFontError::new(
                ExternalThemeFontErrorKind::Io,
                format!(
                    "could not read active-theme font {}: {error}",
                    path.display()
                ),
            )
        })?;
        if !canonical.starts_with(&canonical_package) {
            return Err(ExternalThemeFontError::new(
                ExternalThemeFontErrorKind::InvalidPackage,
                format!(
                    "active-theme font {:?} resolves outside its plugin package",
                    font.file
                ),
            ));
        }
        let bytes = std::fs::read(&canonical).map_err(|error| {
            ExternalThemeFontError::new(
                ExternalThemeFontErrorKind::Io,
                format!(
                    "could not read active-theme font {}: {error}",
                    path.display()
                ),
            )
        })?;
        if bytes.len() > plugins::installer::FONT_FILE_LIMIT {
            return Err(ExternalThemeFontError::new(
                ExternalThemeFontErrorKind::InvalidPackage,
                format!(
                    "active-theme font {:?} exceeds the {} byte limit",
                    font.file,
                    plugins::installer::FONT_FILE_LIMIT
                ),
            ));
        }
        if !bytes.starts_with(b"wOF2") {
            return Err(ExternalThemeFontError::new(
                ExternalThemeFontErrorKind::InvalidPackage,
                format!(
                    "active-theme font {:?} does not have a valid WOFF2 signature",
                    font.file
                ),
            ));
        }
        fonts.push(ExternalThemeFont {
            family: font.family,
            weight: font.weight,
            style: font.style,
            data: base64::engine::general_purpose::STANDARD.encode(bytes),
        });
    }
    Ok(ExternalThemeFonts { fonts })
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

    while let Some(paths) = watch.changed().await {
        if paths
            .iter()
            .any(|path| path.parent() == Some(plugins_dir.as_path()))
        {
            // inotify does not walk into a symlink created after the initial watch.
            match watch_debounced(
                &[&themes_dir, &plugins_dir],
                RecursiveMode::Recursive,
                is_any_change,
            ) {
                Ok(rebuilt) => watch = rebuilt,
                Err(error) => log::warn!("theme watcher: failed to rebuild watch: {error}"),
            }
        }
        let _ = AppEvent::ExternalThemesChanged(scan()).emit(&app);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        ExternalThemeFontErrorKind, ExternalThemeSource, declares_custom_property, load_fonts_from,
        parse_name, scan_from, slugify,
    };
    use base64::Engine;

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

    const FONT_MANIFEST: &str = r#"
id = "alice.dusk"
name = "Dusk"
version = "1.0.0"
description = "A quiet theme"
min_rencal_version = "0.8.0"

[[contributes.fonts]]
family = "Pixel"
file = "fonts/pixel.woff2"
weight = 700
style = "italic"

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
    fn custom_property_detection_ignores_comments_and_accepts_whitespace() {
        assert!(declares_custom_property("--muted : silver;", "--muted"));
        assert!(!declares_custom_property(
            "/* --muted: silver; */ --muted-foreground: gray;",
            "--muted"
        ));
    }

    #[test]
    fn reports_the_legacy_muted_text_token() {
        let temp = tempfile::tempdir().unwrap();
        let themes = temp.path().join("themes");
        std::fs::create_dir_all(&themes).unwrap();
        std::fs::write(themes.join("legacy.css"), "--muted: silver;").unwrap();

        let snapshot = scan_from(Some(&themes), None);

        assert_eq!(snapshot.themes.len(), 1);
        assert_eq!(snapshot.errors.len(), 1);
        assert_eq!(snapshot.errors[0].package, "user:legacy");
        assert!(snapshot.errors[0].message.contains("--muted-foreground"));
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

    #[test]
    fn loads_declared_fonts_for_an_exact_installed_theme() {
        let temp = tempfile::tempdir().unwrap();
        let package = temp.path().join("alice.dusk");
        std::fs::create_dir_all(package.join("fonts")).unwrap();
        std::fs::write(package.join("rencal-plugin.toml"), FONT_MANIFEST).unwrap();
        std::fs::write(package.join("fonts/pixel.woff2"), b"wOF2font").unwrap();

        let result = load_fonts_from(temp.path(), "alice.dusk/dark").unwrap();

        assert_eq!(result.fonts.len(), 1);
        assert_eq!(result.fonts[0].family, "Pixel");
        assert_eq!(result.fonts[0].weight, 700);
        assert_eq!(result.fonts[0].style, crate::plugins::FontStyle::Italic);
        assert_eq!(
            result.fonts[0].data,
            base64::engine::general_purpose::STANDARD.encode(b"wOF2font")
        );
    }

    #[test]
    fn returns_no_fonts_for_loose_or_fontless_themes() {
        assert!(
            load_fonts_from(std::path::Path::new("unused"), "user:local")
                .unwrap()
                .fonts
                .is_empty()
        );

        let temp = tempfile::tempdir().unwrap();
        let package = temp.path().join("alice.dusk");
        std::fs::create_dir_all(&package).unwrap();
        std::fs::write(package.join("rencal-plugin.toml"), MANIFEST).unwrap();
        assert!(
            load_fonts_from(temp.path(), "alice.dusk/dark")
                .unwrap()
                .fonts
                .is_empty()
        );
    }

    #[test]
    fn rejects_missing_invalid_and_oversized_installed_fonts() {
        let temp = tempfile::tempdir().unwrap();
        let package = temp.path().join("alice.dusk");
        std::fs::create_dir_all(package.join("fonts")).unwrap();
        std::fs::write(package.join("rencal-plugin.toml"), FONT_MANIFEST).unwrap();
        let path = package.join("fonts/pixel.woff2");

        let missing = load_fonts_from(temp.path(), "alice.dusk/dark").unwrap_err();
        assert_eq!(missing.kind, ExternalThemeFontErrorKind::Io);

        std::fs::write(&path, b"invalid").unwrap();
        let invalid = load_fonts_from(temp.path(), "alice.dusk/dark").unwrap_err();
        assert_eq!(invalid.kind, ExternalThemeFontErrorKind::InvalidPackage);

        let mut oversized = vec![0; crate::plugins::installer::FONT_FILE_LIMIT + 1];
        oversized[..4].copy_from_slice(b"wOF2");
        std::fs::write(path, oversized).unwrap();
        let oversized = load_fonts_from(temp.path(), "alice.dusk/dark").unwrap_err();
        assert_eq!(oversized.kind, ExternalThemeFontErrorKind::InvalidPackage);

        let unknown = load_fonts_from(temp.path(), "alice.dusk/missing").unwrap_err();
        assert_eq!(unknown.kind, ExternalThemeFontErrorKind::InvalidInput);

        let traversal = load_fonts_from(temp.path(), "../outside").unwrap_err();
        assert_eq!(traversal.kind, ExternalThemeFontErrorKind::InvalidInput);
    }

    #[cfg(unix)]
    #[test]
    fn loads_fonts_from_a_symlinked_checkout() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().unwrap();
        let plugins = temp.path().join("plugins");
        let checkout = temp.path().join("checkout");
        std::fs::create_dir_all(checkout.join("fonts")).unwrap();
        std::fs::create_dir(&plugins).unwrap();
        std::fs::write(checkout.join("rencal-plugin.toml"), FONT_MANIFEST).unwrap();
        std::fs::write(checkout.join("fonts/pixel.woff2"), b"wOF2font").unwrap();
        symlink(&checkout, plugins.join("alice.dusk")).unwrap();

        let fonts = load_fonts_from(&plugins, "alice.dusk/dark").unwrap();
        assert_eq!(fonts.fonts.len(), 1);

        std::fs::write(checkout.join("rencal-plugin.toml"), MANIFEST).unwrap();
        assert!(
            load_fonts_from(&plugins, "alice.dusk/dark")
                .unwrap()
                .fonts
                .is_empty()
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_fonts_resolving_outside_a_local_checkout() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().unwrap();
        let plugins = temp.path().join("plugins");
        let checkout = temp.path().join("checkout");
        std::fs::create_dir_all(checkout.join("fonts")).unwrap();
        std::fs::create_dir(&plugins).unwrap();
        std::fs::write(checkout.join("rencal-plugin.toml"), FONT_MANIFEST).unwrap();
        let outside = temp.path().join("outside.woff2");
        std::fs::write(&outside, b"wOF2font").unwrap();
        symlink(&outside, checkout.join("fonts/pixel.woff2")).unwrap();
        symlink(&checkout, plugins.join("alice.dusk")).unwrap();

        let error = load_fonts_from(&plugins, "alice.dusk/dark").unwrap_err();
        assert_eq!(error.kind, ExternalThemeFontErrorKind::InvalidPackage);
        assert!(error.to_string().contains("outside its plugin package"));
    }
}
