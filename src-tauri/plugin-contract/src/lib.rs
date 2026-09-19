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

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct Contributions {
    #[serde(default)]
    pub themes: Vec<ThemeContribution>,
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
            if key != "themes" {
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

fn validate_css_path(path: &str) -> Result<(), PluginError> {
    let safe = !path.is_empty()
        && !path.starts_with('/')
        && !path.contains('\\')
        && !path.contains(':')
        && path.ends_with(".css")
        && path
            .split('/')
            .all(|component| !component.is_empty() && component != "." && component != "..");
    if !safe {
        return Err(PluginError::new(format!(
            "theme CSS path {path:?} must be a relative .css path within the package"
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
}
