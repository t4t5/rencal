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

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Appearance {
    Light,
    Dark,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ThemeContribution {
    pub id: String,
    pub name: String,
    pub css: String,
    pub appearance: Appearance,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Contributions {
    #[serde(default)]
    pub themes: Vec<ThemeContribution>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
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
    reject_unsupported_contributions(&value)?;
    let manifest: PluginManifest = value
        .try_into()
        .map_err(|error| PluginError::new(format!("invalid {MANIFEST_FILE}: {error}")))?;

    validate_package_id(&manifest.id)?;
    if manifest.name.trim().is_empty() {
        return Err(PluginError::new("plugin name must not be empty"));
    }
    if manifest.description.trim().is_empty() {
        return Err(PluginError::new("plugin description must not be empty"));
    }

    Version::parse(&manifest.version).map_err(|error| {
        PluginError::new(format!(
            "plugin version {:?} is not semantic: {error}",
            manifest.version
        ))
    })?;
    let minimum = Version::parse(&manifest.min_rencal_version).map_err(|error| {
        PluginError::new(format!(
            "min_rencal_version {:?} is not semantic: {error}",
            manifest.min_rencal_version
        ))
    })?;
    if let Some(current) = app_version
        && current < &minimum
    {
        return Err(PluginError::new(format!(
            "requires renCal {minimum} or newer (running {current})"
        )));
    }

    if manifest.contributes.themes.is_empty() {
        return Err(PluginError::new(
            "unsupported package: at least one theme contribution is required",
        ));
    }

    let mut theme_ids = HashSet::new();
    for theme in &manifest.contributes.themes {
        validate_contribution_id(&theme.id)?;
        if !theme_ids.insert(&theme.id) {
            return Err(PluginError::new(format!(
                "duplicate theme contribution id {:?}",
                theme.id
            )));
        }
        if theme.name.trim().is_empty() {
            return Err(PluginError::new(format!(
                "theme {:?} name must not be empty",
                theme.id
            )));
        }
        validate_css_path(&theme.css)?;
    }

    Ok(manifest)
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
