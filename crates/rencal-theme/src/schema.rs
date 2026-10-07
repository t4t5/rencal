//! The published JSON Schema for theme files, generated from the token catalogue.

use std::borrow::Cow;

use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde_json::{Value as Json, json};

use crate::theme::{SCHEMA_URL, Style, ThemeFamily};
use crate::tokens::{Prop, Slot, State, tokens};
use crate::value::Kind;

/// The schema committed at `schema/v1.json` and published at [`SCHEMA_URL`].
pub fn theme_schema() -> Json {
    let mut schema = schemars::schema_for!(ThemeFamily).to_value();
    let obj = schema.as_object_mut().expect("schema is an object");
    obj.insert("$id".into(), SCHEMA_URL.into());
    obj.insert("title".into(), "renCal theme family".into());
    schema
}

/// `schema/v1.json` as committed.
pub fn theme_schema_string() -> String {
    let mut out = serde_json::to_string_pretty(&theme_schema()).expect("schema serialises");
    out.push('\n');
    out
}

fn kind_name(kind: Kind) -> &'static str {
    match kind {
        Kind::Color => "Color",
        Kind::Fraction => "Fraction",
        Kind::Px => "Px",
        Kind::Weight => "Weight",
        Kind::Fonts => "Fonts",
        Kind::Transform => "Transform",
        Kind::Fill => "Fill",
        Kind::BorderStyle => "BorderStyle",
        Kind::Shadows => "Shadows",
        Kind::TextShadow => "TextShadow",
    }
}

const COLOR_PATTERN: &str = "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$";

fn kind_schema(kind: Kind) -> Json {
    let color = json!({ "type": "string", "pattern": COLOR_PATTERN });
    let inner = match kind {
        Kind::Color => color.clone(),
        Kind::Fraction => json!({ "type": "number", "minimum": 0, "maximum": 1 }),
        Kind::Px => json!({ "type": "number", "description": "Pixels." }),
        Kind::Weight => json!({ "type": "number", "minimum": 1, "maximum": 1000 }),
        Kind::Fonts => json!({
            "description": "Font families, first available wins.",
            "anyOf": [{ "type": "string" }, { "type": "array", "items": { "type": "string" }, "minItems": 1 }]
        }),
        Kind::Transform => json!({ "enum": ["none", "uppercase"] }),
        Kind::Fill => json!({ "anyOf": [color.clone(), {
            "type": "object",
            "required": ["gradient"],
            "properties": { "gradient": {
                "type": "object",
                "required": ["from", "to"],
                "properties": { "angle": { "type": "number" }, "from": color.clone(), "to": color.clone() }
            } }
        }] }),
        Kind::BorderStyle => json!({
            "enum": ["solid", "bevel_raised", "bevel_sunken", "bevel_raised_double", "bevel_sunken_double"]
        }),
        Kind::Shadows => json!({ "type": "array", "items": {
            "type": "object",
            "required": ["color"],
            "properties": {
                "x": { "type": "number" }, "y": { "type": "number" },
                "blur": { "type": "number" }, "spread": { "type": "number" },
                "color": color.clone(), "inset": { "type": "boolean" }
            }
        } }),
        Kind::TextShadow => json!({
            "type": "object",
            "required": ["color"],
            "properties": { "x": { "type": "number" }, "y": { "type": "number" }, "color": color.clone() }
        }),
    };
    json!({ "anyOf": [inner, { "type": "null" }] })
}

impl JsonSchema for Style {
    fn schema_name() -> Cow<'static, str> {
        "Style".into()
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        let mut refs = |kind: Kind| {
            let name = kind_name(kind);
            generator
                .definitions_mut()
                .entry(name)
                .or_insert_with(|| kind_schema(kind));
            json!({ "$ref": format!("#/$defs/{name}") })
        };
        let properties: serde_json::Map<String, Json> = tokens()
            .iter()
            .map(|t| (t.key.to_owned(), refs(t.kind)))
            .collect();

        let slots = Slot::ALL.map(|s| regex_escape(s.key())).join("|");
        let states = State::ALL.map(|s| s.key()).join("|");
        let pattern_properties: serde_json::Map<String, Json> = Prop::ALL
            .iter()
            .map(|prop| {
                let pattern = format!("^({slots})(\\.({states}))?\\.{}$", prop.key());
                (pattern, refs(prop.kind()))
            })
            .collect();

        Schema::try_from(json!({
            "type": "object",
            "description": "Flat dotted token keys. Unset or null tokens are derived.",
            "properties": properties,
            "patternProperties": pattern_properties,
            "additionalProperties": false
        }))
        .expect("style schema is an object")
    }
}

fn regex_escape(key: &str) -> String {
    key.replace('.', "\\.")
}
