//! Shared manifest contract for renCal plugins.
//!
//! This crate intentionally has no Tauri dependency so both the app and the
//! repository indexer validate packages with the same rules.

use std::collections::HashSet;
use std::fmt;

use semver::Version;
use serde::{Deserialize, Serialize};
use specta::Type;

pub const MANIFEST_FILE: &str = "rencal-plugin.toml";
pub const MAX_NAME_LENGTH: usize = 100;
pub const MAX_DESCRIPTION_LENGTH: usize = 500;
pub const MAX_FONT_FACES: usize = 8;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Appearance {
    Light,
    Dark,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ThemeContribution {
    pub id: String,
    pub name: String,
    pub css: String,
    pub appearance: Appearance,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, Hash, PartialEq, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum FontStyle {
    #[default]
    Normal,
    Italic,
    Oblique,
}

const fn default_font_weight() -> u16 {
    400
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct FontContribution {
    pub family: String,
    pub file: String,
    #[serde(default = "default_font_weight")]
    pub weight: u16,
    #[serde(default)]
    pub style: FontStyle,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct Contributions {
    #[serde(default)]
    pub themes: Vec<ThemeContribution>,
    #[serde(default)]
    pub fonts: Vec<FontContribution>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub min_rencal_version: String,
    #[serde(default)]
    pub contributes: Contributions,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PluginError(String);

impl PluginError {
    #[doc(hidden)]
    pub fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl fmt::Display for PluginError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for PluginError {}

/// Parse and validate the shared plugin manifest contract.
///
/// Pass the running app version to enforce compatibility. `None` is useful to
/// indexers, which validate packages independently of a particular installation.
pub fn validate_manifest(
    contents: &str,
    app_version: Option<&Version>,
) -> Result<PluginManifest, PluginError> {
    let value: toml::Value = toml::from_str(contents)
        .map_err(|error| PluginError::new(format!("invalid {MANIFEST_FILE}: {error}")))?;
    validate_compatibility(&value, app_version)?;
    reject_unsupported_contributions(&value)?;
    let mut manifest: PluginManifest = value
        .try_into()
        .map_err(|error| PluginError::new(format!("invalid {MANIFEST_FILE}: {error}")))?;

    validate_package_id(&manifest.id)?;
    manifest.name = validate_display_text(&manifest.name, "plugin name", MAX_NAME_LENGTH)?;
    manifest.description = validate_display_text(
        &manifest.description,
        "plugin description",
        MAX_DESCRIPTION_LENGTH,
    )?;

    Version::parse(&manifest.version).map_err(|error| {
        PluginError::new(format!(
            "plugin version {:?} is not semantic: {error}",
            manifest.version
        ))
    })?;
    if manifest.contributes.themes.is_empty() {
        return Err(PluginError::new(
            "unsupported package: at least one theme contribution is required",
        ));
    }

    let mut theme_ids = HashSet::new();
    for theme in &mut manifest.contributes.themes {
        validate_contribution_id(&theme.id)?;
        if !theme_ids.insert(&theme.id) {
            return Err(PluginError::new(format!(
                "duplicate theme contribution id {:?}",
                theme.id
            )));
        }
        theme.name = validate_display_text(
            &theme.name,
            &format!("theme {:?} name", theme.id),
            MAX_NAME_LENGTH,
        )?;
        validate_css_path(&theme.css)?;
    }

    if manifest.contributes.fonts.len() > MAX_FONT_FACES {
        return Err(PluginError::new(format!(
            "plugin packages may contribute at most {MAX_FONT_FACES} font faces"
        )));
    }
    let mut font_faces = HashSet::new();
    for font in &mut manifest.contributes.fonts {
        font.family = validate_display_text(&font.family, "font family", MAX_NAME_LENGTH)?;
        validate_font_path(&font.file)?;
        if !(1..=1000).contains(&font.weight) {
            return Err(PluginError::new(format!(
                "font {:?} weight must be between 1 and 1000",
                font.family
            )));
        }
        let face = (font.family.to_lowercase(), font.weight, font.style);
        if !font_faces.insert(face) {
            return Err(PluginError::new(format!(
                "duplicate font face {:?} with weight {} and style {:?}",
                font.family, font.weight, font.style
            )));
        }
    }

    Ok(manifest)
}

fn validate_display_text(
    value: &str,
    field: &str,
    max_length: usize,
) -> Result<String, PluginError> {
    if value.chars().any(char::is_control) {
        return Err(PluginError::new(format!(
            "{field} must not contain control characters"
        )));
    }

    let value = value.trim();
    if value.is_empty() {
        return Err(PluginError::new(format!("{field} must not be empty")));
    }
    if value.chars().count() > max_length {
        return Err(PluginError::new(format!(
            "{field} must be at most {max_length} characters"
        )));
    }

    Ok(value.to_owned())
}

fn validate_compatibility(
    value: &toml::Value,
    app_version: Option<&Version>,
) -> Result<(), PluginError> {
    let Some(minimum) = value
        .as_table()
        .and_then(|table| table.get("min_rencal_version"))
        .and_then(toml::Value::as_str)
    else {
        // Let the full manifest parse report a missing field or the wrong type.
        return Ok(());
    };
    let minimum = Version::parse(minimum).map_err(|error| {
        PluginError::new(format!(
            "min_rencal_version {minimum:?} is not semantic: {error}"
        ))
    })?;
    if let Some(current) = app_version
        && current < &minimum
    {
        return Err(PluginError::new(format!(
            "requires renCal {minimum} or newer (running {current})"
        )));
    }
    Ok(())
}

/// Verify the package owner against the GitHub repository owner.
pub fn validate_manifest_owner(
    manifest: &PluginManifest,
    repository_owner: &str,
) -> Result<(), PluginError> {
    validate_package_id(&manifest.id)?;
    let owner = manifest.id.split_once('.').expect("validated plugin id").0;
    if !owner.eq_ignore_ascii_case(repository_owner) {
        return Err(PluginError::new(format!(
            "plugin id owner {owner:?} does not match repository owner {repository_owner:?}"
        )));
    }
    Ok(())
}

/// Releases may prefix the semantic version with `v`, but must otherwise match.
pub fn validate_release_tag(manifest: &PluginManifest, tag: &str) -> Result<(), PluginError> {
    if tag.strip_prefix('v').unwrap_or(tag) != manifest.version {
        return Err(PluginError::new(format!(
            "release tag {tag:?} does not match manifest version {:?}",
            manifest.version
        )));
    }
    Ok(())
}

fn reject_unsupported_contributions(value: &toml::Value) -> Result<(), PluginError> {
    let Some(table) = value.as_table() else {
        return Err(PluginError::new(format!(
            "invalid {MANIFEST_FILE}: expected a TOML table"
        )));
    };
    for key in ["app", "provider", "theme"] {
        if table.contains_key(key) {
            return Err(PluginError::new(format!(
                "unsupported package contribution {key:?}"
            )));
        }
    }
    if let Some(contributes) = table.get("contributes").and_then(toml::Value::as_table) {
        for key in contributes.keys() {
            if key != "themes" && key != "fonts" {
                return Err(PluginError::new(format!(
                    "unsupported package contribution {:?}",
                    format!("contributes.{key}")
                )));
            }
        }
    }
    Ok(())
}

#[doc(hidden)]
pub fn validate_package_id(id: &str) -> Result<(), PluginError> {
    let Some((owner, name)) = id.split_once('.') else {
        return Err(PluginError::new(
            "plugin id must be lowercase <github-owner>.<name>",
        ));
    };
    if name.contains('.')
        || !valid_slug(owner)
        || !valid_slug(name)
        || id.bytes().any(|byte| byte.is_ascii_uppercase())
    {
        return Err(PluginError::new(
            "plugin id must be lowercase <github-owner>.<name> using a-z, 0-9, and hyphens",
        ));
    }
    if owner == "rencal" {
        return Err(PluginError::new(
            "plugin ids beginning with rencal. are reserved",
        ));
    }
    Ok(())
}

fn validate_contribution_id(id: &str) -> Result<(), PluginError> {
    if !valid_slug(id) || id.bytes().any(|byte| byte.is_ascii_uppercase()) {
        return Err(PluginError::new(format!(
            "theme contribution id {id:?} must use lowercase a-z, 0-9, and hyphens"
        )));
    }
    Ok(())
}

fn valid_slug(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn validate_safe_relative_path(path: &str) -> bool {
    !path.is_empty()
        && !path.starts_with('/')
        && !path.contains('\\')
        && !path.contains(':')
        && path
            .split('/')
            .all(|component| !component.is_empty() && component != "." && component != "..")
}

fn validate_css_path(path: &str) -> Result<(), PluginError> {
    let safe = !path.is_empty() && validate_safe_relative_path(path) && path.ends_with(".css");
    if !safe {
        return Err(PluginError::new(format!(
            "theme CSS path {path:?} must be a relative .css path within the package"
        )));
    }
    Ok(())
}

fn validate_font_path(path: &str) -> Result<(), PluginError> {
    if !validate_safe_relative_path(path) || !path.ends_with(".woff2") {
        return Err(PluginError::new(format!(
            "font file path {path:?} must be a relative .woff2 path within the package"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const MANIFEST: &str = r#"
id = "alice.dusk"
name = "Dusk"
version = "1.2.3"
description = "A quiet theme"
min_rencal_version = "0.8.0"

[[contributes.themes]]
id = "dark"
name = "Dusk Dark"
css = "themes/dark.css"
appearance = "dark"
"#;

    #[test]
    fn trims_human_readable_fields() {
        let contents = MANIFEST
            .replacen("name = \"Dusk\"", "name = \"  Dusk  \"", 1)
            .replacen(
                "description = \"A quiet theme\"",
                "description = \"  A quiet theme  \"",
                1,
            )
            .replacen("name = \"Dusk Dark\"", "name = \"  Dusk Dark  \"", 1);

        let manifest = validate_manifest(&contents, None).unwrap();

        assert_eq!(manifest.name, "Dusk");
        assert_eq!(manifest.description, "A quiet theme");
        assert_eq!(manifest.contributes.themes[0].name, "Dusk Dark");
    }

    #[test]
    fn caps_human_readable_fields_by_character_count() {
        let max_name = "é".repeat(MAX_NAME_LENGTH);
        let max_description = "d".repeat(MAX_DESCRIPTION_LENGTH);
        let contents = MANIFEST
            .replacen("Dusk\"", &format!("{max_name}\""), 1)
            .replacen("A quiet theme", &max_description, 1);
        let manifest = validate_manifest(&contents, None).unwrap();
        assert_eq!(manifest.name, max_name);
        assert_eq!(manifest.description, max_description);

        for (from, too_long, expected) in [
            (
                "name = \"Dusk\"",
                format!("name = \"{}\"", "n".repeat(MAX_NAME_LENGTH + 1)),
                "plugin name must be at most 100 characters",
            ),
            (
                "description = \"A quiet theme\"",
                format!(
                    "description = \"{}\"",
                    "d".repeat(MAX_DESCRIPTION_LENGTH + 1)
                ),
                "plugin description must be at most 500 characters",
            ),
            (
                "name = \"Dusk Dark\"",
                format!("name = \"{}\"", "n".repeat(MAX_NAME_LENGTH + 1)),
                "theme \"dark\" name must be at most 100 characters",
            ),
        ] {
            let error = validate_manifest(&MANIFEST.replacen(from, &too_long, 1), None)
                .unwrap_err()
                .to_string();
            assert_eq!(error, expected);
        }
    }

    #[test]
    fn rejects_control_characters_in_human_readable_fields() {
        for (from, with_control, expected) in [
            (
                "name = \"Dusk\"",
                "name = \"Dusk\\u0000\"",
                "plugin name must not contain control characters",
            ),
            (
                "description = \"A quiet theme\"",
                "description = \"A quiet\\n theme\"",
                "plugin description must not contain control characters",
            ),
            (
                "name = \"Dusk Dark\"",
                "name = \"Dusk\\tDark\"",
                "theme \"dark\" name must not contain control characters",
            ),
        ] {
            let error = validate_manifest(&MANIFEST.replacen(from, with_control, 1), None)
                .unwrap_err()
                .to_string();
            assert_eq!(error, expected);
        }
    }

    #[test]
    fn validates_font_defaults_styles_and_weight_boundaries() {
        let fonts = r#"
[[contributes.fonts]]
family = "  Pixelated MS Sans Serif  "
file = "fonts/regular.woff2"

[[contributes.fonts]]
family = "Pixelated MS Sans Serif"
file = "fonts/italic.woff2"
weight = 1
style = "italic"

[[contributes.fonts]]
family = "Pixelated MS Sans Serif"
file = "fonts/oblique.woff2"
weight = 1000
style = "oblique"
"#;
        let manifest = validate_manifest(&format!("{MANIFEST}{fonts}"), None).unwrap();

        assert_eq!(
            manifest.contributes.fonts[0].family,
            "Pixelated MS Sans Serif"
        );
        assert_eq!(manifest.contributes.fonts[0].weight, 400);
        assert_eq!(manifest.contributes.fonts[0].style, FontStyle::Normal);
        assert_eq!(manifest.contributes.fonts[1].weight, 1);
        assert_eq!(manifest.contributes.fonts[1].style, FontStyle::Italic);
        assert_eq!(manifest.contributes.fonts[2].weight, 1000);
        assert_eq!(manifest.contributes.fonts[2].style, FontStyle::Oblique);
    }

    #[test]
    fn rejects_invalid_font_fields_and_duplicate_faces() {
        let valid = "\n[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"fonts/pixel.woff2\"\n";
        for (font, expected) in [
            (
                "\n[[contributes.fonts]]\nfamily = \"  \"\nfile = \"font.woff2\"\n",
                "font family must not be empty",
            ),
            (
                "\n[[contributes.fonts]]\nfamily = \"Bad\\u0000Font\"\nfile = \"font.woff2\"\n",
                "font family must not contain control characters",
            ),
            (
                "\n[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"../font.woff2\"\n",
                "must be a relative .woff2 path",
            ),
            (
                "\n[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"/font.woff2\"\n",
                "must be a relative .woff2 path",
            ),
            (
                "\n[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"fonts\\\\font.woff2\"\n",
                "must be a relative .woff2 path",
            ),
            (
                "\n[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"C:font.woff2\"\n",
                "must be a relative .woff2 path",
            ),
            (
                "\n[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"fonts//font.woff2\"\n",
                "must be a relative .woff2 path",
            ),
            (
                "\n[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"fonts/./font.woff2\"\n",
                "must be a relative .woff2 path",
            ),
            (
                "\n[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"font.WOFF2\"\n",
                "must be a relative .woff2 path",
            ),
            (
                "\n[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"font.woff2\"\nweight = 0\n",
                "weight must be between 1 and 1000",
            ),
            (
                "\n[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"font.woff2\"\nweight = 1001\n",
                "weight must be between 1 and 1000",
            ),
        ] {
            let error = validate_manifest(&format!("{MANIFEST}{font}"), None)
                .unwrap_err()
                .to_string();
            assert!(error.contains(expected), "{error}");
        }

        let long_family = format!(
            "{MANIFEST}\n[[contributes.fonts]]\nfamily = \"{}\"\nfile = \"font.woff2\"\n",
            "f".repeat(MAX_NAME_LENGTH + 1)
        );
        assert!(
            validate_manifest(&long_family, None)
                .unwrap_err()
                .to_string()
                .contains("font family must be at most 100 characters")
        );
        let invalid_style = format!(
            "{MANIFEST}\n[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"font.woff2\"\nstyle = \"slanted\"\n"
        );
        assert!(validate_manifest(&invalid_style, None).is_err());

        let duplicate = format!(
            "{MANIFEST}{valid}[[contributes.fonts]]\nfamily = \" pixel \"\nfile = \"fonts/other.woff2\"\n"
        );
        assert!(
            validate_manifest(&duplicate, None)
                .unwrap_err()
                .to_string()
                .contains("duplicate font face")
        );
    }

    #[test]
    fn caps_font_faces_and_accepts_the_new_contribution_key() {
        let mut fonts = String::new();
        for weight in 1..=MAX_FONT_FACES {
            fonts.push_str(&format!(
                "\n[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"fonts/{weight}.woff2\"\nweight = {weight}\n"
            ));
        }
        assert!(validate_manifest(&format!("{MANIFEST}{fonts}"), None).is_ok());
        fonts.push_str(
            "\n[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"fonts/extra.woff2\"\nweight = 9\n",
        );
        assert!(
            validate_manifest(&format!("{MANIFEST}{fonts}"), None)
                .unwrap_err()
                .to_string()
                .contains("at most 8 font faces")
        );

        let old_unknown = format!("{MANIFEST}\n[contributes.icons]\n");
        assert!(
            validate_manifest(&old_unknown, None)
                .unwrap_err()
                .to_string()
                .contains("contributes.icons")
        );
    }
}
