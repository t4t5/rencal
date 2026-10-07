//! Theme files (§4.1): a JSON theme family with one or more variants, each a
//! flat map of dotted token keys.

use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};
use serde_json::Value as Json;

use crate::tokens::{SlotKey, index_of, tokens};
use crate::value::Value;

/// The `$schema` URL theme files point at.
pub const SCHEMA_URL: &str = "https://rencal.org/schema/themes/v1.json";

/// One theme file.
#[derive(Clone, Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct ThemeFamily {
    #[serde(rename = "$schema", default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    pub themes: Vec<ThemeContent>,
}

/// One variant of a family.
#[derive(Clone, Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct ThemeContent {
    pub name: String,
    pub appearance: Appearance,
    #[serde(default)]
    pub style: Style,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Appearance {
    Light,
    Dark,
}

/// Token values as written: `null` means unset. Kept as raw JSON so one bad
/// value never fails the file; [`ThemeContent::compile`] reports it instead.
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(transparent)]
pub struct Style(pub BTreeMap<String, Json>);

/// A problem with one key of a theme. The key is ignored; the rest loads.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Diagnostic {
    /// The variant the key belongs to.
    pub theme: String,
    pub key: String,
    pub message: String,
}

impl std::fmt::Display for Diagnostic {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: `{}`: {}", self.theme, self.key, self.message)
    }
}

/// A validated variant: typed explicit values only, nothing derived yet.
#[derive(Clone, Debug, PartialEq)]
pub struct Theme {
    pub name: String,
    pub appearance: Appearance,
    /// Indexed like [`tokens()`]; `None` where the theme leaves the token unset.
    pub(crate) values: Vec<Option<Value>>,
    pub(crate) slots: HashMap<SlotKey, Value>,
}

impl Theme {
    /// The value the theme sets for `key`, if any.
    pub fn explicit(&self, key: &str) -> Option<&Value> {
        self.values.get(index_of(key)?)?.as_ref()
    }

    pub fn slot_value(&self, key: SlotKey) -> Option<&Value> {
        self.slots.get(&key)
    }
}

impl ThemeFamily {
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    pub fn to_json_pretty(&self) -> String {
        let mut out = serde_json::to_string_pretty(self).expect("theme families serialise");
        out.push('\n');
        out
    }
}

impl ThemeContent {
    /// Validates every key. Unknown keys and invalid values are skipped and
    /// reported; the theme always compiles.
    pub fn compile(&self) -> (Theme, Vec<Diagnostic>) {
        let mut theme = Theme {
            name: self.name.clone(),
            appearance: self.appearance,
            values: vec![None; tokens().len()],
            slots: HashMap::new(),
        };
        let mut diagnostics = Vec::new();
        let mut report = |key: &str, message: String| {
            diagnostics.push(Diagnostic {
                theme: self.name.clone(),
                key: key.to_owned(),
                message,
            });
        };
        for (key, json) in &self.style.0 {
            if let Some(index) = index_of(key) {
                match Value::parse(tokens()[index].kind, json) {
                    Ok(value) => theme.values[index] = value,
                    Err(message) => report(key, message),
                }
            } else if let Some(slot_key) = SlotKey::parse(key) {
                match Value::parse(slot_key.prop.kind(), json) {
                    Ok(Some(value)) => {
                        theme.slots.insert(slot_key, value);
                    }
                    Ok(None) => {}
                    Err(message) => report(key, message),
                }
            } else {
                report(key, "unknown token".into());
            }
        }
        (theme, diagnostics)
    }

    /// The inverse of [`ThemeContent::compile`]: a variant setting exactly `theme`'s values.
    pub fn from_theme(theme: &Theme) -> ThemeContent {
        let mut style = BTreeMap::new();
        for (def, value) in tokens().iter().zip(&theme.values) {
            if let Some(value) = value {
                style.insert(def.key.to_owned(), value.to_json());
            }
        }
        for (key, value) in &theme.slots {
            style.insert(key.key(), value.to_json());
        }
        ThemeContent {
            name: theme.name.clone(),
            appearance: theme.appearance,
            style: Style(style),
        }
    }
}

/// Lowercase, ASCII alphanumerics separated by single dashes.
pub fn slugify(name: &str) -> String {
    let mut slug = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c.to_ascii_lowercase());
        } else if !slug.is_empty() && !slug.ends_with('-') {
            slug.push('-');
        }
    }
    slug.trim_end_matches('-').to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bad_keys_are_reported_not_fatal() {
        let family = ThemeFamily::from_json(
            r##"{ "name": "X", "themes": [{ "name": "X", "appearance": "dark", "style": {
                "background": "#123456",
                "text": "red",
                "nope": 1,
                "radius": null,
                "button.hover.fill": { "gradient": { "angle": 180, "from": "#fff", "to": "#000" } }
            } }] }"##,
        )
        .unwrap();
        let (theme, diagnostics) = family.themes[0].compile();
        assert_eq!(
            theme
                .explicit("background")
                .unwrap()
                .as_color()
                .unwrap()
                .to_hex(),
            "#123456ff"
        );
        assert!(theme.explicit("text").is_none());
        assert!(theme.explicit("radius").is_none());
        let keys: Vec<_> = diagnostics.iter().map(|d| d.key.as_str()).collect();
        assert_eq!(keys, ["nope", "text"]);
        assert_eq!(theme.slots.len(), 1);
    }

    #[test]
    fn slugifies_variant_names() {
        assert_eq!(slugify("Ren Light"), "ren-light");
        assert_eq!(slugify("  Catpuccin -- Latte! "), "catpuccin-latte");
    }
}
