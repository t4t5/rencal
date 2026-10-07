//! Typed token values and their JSON parsing.

use serde_json::Value as Json;

use crate::color::Rgba;

/// What a token holds. Decides how its JSON value is parsed and which schema
/// it gets.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Kind {
    /// `#RGB`, `#RRGGBB` or `#RRGGBBAA`.
    Color,
    /// A plain number in 0–1 (`surface.tint_step`).
    Fraction,
    /// Pixels.
    Px,
    /// A font weight, 100–900.
    Weight,
    /// A family fallback list, first match wins: `["Pixelated MS Sans Serif", "Arial"]`.
    Fonts,
    /// `none | uppercase`.
    Transform,
    /// A colour or `{ "gradient": { "angle", "from", "to" } }`.
    Fill,
    /// `solid | bevel_raised | bevel_sunken | bevel_raised_double | bevel_sunken_double`.
    BorderStyle,
    /// A list of `{ x, y, blur, spread, color, inset }`.
    Shadows,
    /// `{ x, y, color }`.
    TextShadow,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Color(Rgba),
    Fraction(f64),
    Px(f64),
    Weight(f64),
    Fonts(Vec<String>),
    Transform(TextTransform),
    Fill(Fill),
    BorderStyle(BorderStyle),
    Shadows(Vec<Shadow>),
    TextShadow(TextShadow),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TextTransform {
    None,
    Uppercase,
}

impl TextTransform {
    /// GPUI has no text-transform, so callers apply it when building the string.
    pub fn apply(self, text: &str) -> String {
        match self {
            TextTransform::None => text.to_owned(),
            TextTransform::Uppercase => text.to_uppercase(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Fill {
    Solid(Rgba),
    /// A two-stop linear gradient; `angle` in degrees, CSS convention (0 = to top).
    Gradient {
        angle: f64,
        from: Rgba,
        to: Rgba,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BorderStyle {
    Solid,
    BevelRaised,
    BevelSunken,
    BevelRaisedDouble,
    BevelSunkenDouble,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Shadow {
    pub x: f64,
    pub y: f64,
    pub blur: f64,
    pub spread: f64,
    pub color: Rgba,
    pub inset: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextShadow {
    pub x: f64,
    pub y: f64,
    pub color: Rgba,
}

impl Value {
    pub fn kind(&self) -> Kind {
        match self {
            Value::Color(_) => Kind::Color,
            Value::Fraction(_) => Kind::Fraction,
            Value::Px(_) => Kind::Px,
            Value::Weight(_) => Kind::Weight,
            Value::Fonts(_) => Kind::Fonts,
            Value::Transform(_) => Kind::Transform,
            Value::Fill(_) => Kind::Fill,
            Value::BorderStyle(_) => Kind::BorderStyle,
            Value::Shadows(_) => Kind::Shadows,
            Value::TextShadow(_) => Kind::TextShadow,
        }
    }

    pub fn as_color(&self) -> Option<Rgba> {
        match self {
            Value::Color(c) | Value::Fill(Fill::Solid(c)) => Some(*c),
            _ => None,
        }
    }

    pub fn as_number(&self) -> Option<f64> {
        match self {
            Value::Fraction(v) | Value::Px(v) | Value::Weight(v) => Some(*v),
            _ => None,
        }
    }

    /// Parses `json` as a value of `kind`. `Ok(None)` is an explicit `null`
    /// ("unset, use the derived value").
    pub fn parse(kind: Kind, json: &Json) -> Result<Option<Value>, String> {
        if json.is_null() {
            return Ok(None);
        }
        let value = match kind {
            Kind::Color => Value::Color(color(json)?),
            Kind::Fraction => {
                let v = number(json)?;
                if !(0.0..=1.0).contains(&v) {
                    return Err(format!("expected a number in 0–1, got {v}"));
                }
                Value::Fraction(v)
            }
            Kind::Px => Value::Px(number(json)?),
            Kind::Weight => {
                let v = number(json)?;
                if !(1.0..=1000.0).contains(&v) {
                    return Err(format!("expected a font weight in 1–1000, got {v}"));
                }
                Value::Weight(v)
            }
            Kind::Fonts => Value::Fonts(fonts(json)?),
            Kind::Transform => Value::Transform(match json.as_str() {
                Some("none") => TextTransform::None,
                Some("uppercase") => TextTransform::Uppercase,
                _ => return Err(format!("expected \"none\" or \"uppercase\", got {json}")),
            }),
            Kind::Fill => Value::Fill(fill(json)?),
            Kind::BorderStyle => Value::BorderStyle(match json.as_str() {
                Some("solid") => BorderStyle::Solid,
                Some("bevel_raised") => BorderStyle::BevelRaised,
                Some("bevel_sunken") => BorderStyle::BevelSunken,
                Some("bevel_raised_double") => BorderStyle::BevelRaisedDouble,
                Some("bevel_sunken_double") => BorderStyle::BevelSunkenDouble,
                _ => return Err(format!("unknown border style {json}")),
            }),
            Kind::Shadows => {
                let items = json.as_array().ok_or("expected a list of shadows")?;
                Value::Shadows(items.iter().map(shadow).collect::<Result<_, _>>()?)
            }
            Kind::TextShadow => {
                let obj = json.as_object().ok_or("expected { x, y, color }")?;
                Value::TextShadow(TextShadow {
                    x: field_number(obj, "x")?,
                    y: field_number(obj, "y")?,
                    color: color(obj.get("color").ok_or("missing \"color\"")?)?,
                })
            }
        };
        Ok(Some(value))
    }

    /// The JSON form [`Value::parse`] reads back.
    pub fn to_json(&self) -> Json {
        match self {
            Value::Color(c) => Json::String(c.to_hex()),
            Value::Fraction(v) | Value::Px(v) | Value::Weight(v) => number_json(*v),
            Value::Fonts(list) => list.iter().map(|f| Json::String(f.clone())).collect(),
            Value::Transform(TextTransform::None) => "none".into(),
            Value::Transform(TextTransform::Uppercase) => "uppercase".into(),
            Value::Fill(Fill::Solid(c)) => Json::String(c.to_hex()),
            Value::Fill(Fill::Gradient { angle, from, to }) => serde_json::json!({
                "gradient": { "angle": number_json(*angle), "from": from.to_hex(), "to": to.to_hex() }
            }),
            Value::BorderStyle(style) => match style {
                BorderStyle::Solid => "solid",
                BorderStyle::BevelRaised => "bevel_raised",
                BorderStyle::BevelSunken => "bevel_sunken",
                BorderStyle::BevelRaisedDouble => "bevel_raised_double",
                BorderStyle::BevelSunkenDouble => "bevel_sunken_double",
            }
            .into(),
            Value::Shadows(list) => list
                .iter()
                .map(|s| {
                    serde_json::json!({
                        "x": number_json(s.x), "y": number_json(s.y),
                        "blur": number_json(s.blur), "spread": number_json(s.spread),
                        "color": s.color.to_hex(), "inset": s.inset,
                    })
                })
                .collect(),
            Value::TextShadow(t) => serde_json::json!({
                "x": number_json(t.x), "y": number_json(t.y), "color": t.color.to_hex(),
            }),
        }
    }
}

/// Integral values serialise without a fraction (`8`, not `8.0`).
pub(crate) fn number_json(v: f64) -> Json {
    if v.fract() == 0.0 && v.abs() < 1e15 {
        Json::from(v as i64)
    } else {
        // Trim float noise (0.30000000000000004) so exported themes stay readable.
        let rounded = (v * 1e6).round() / 1e6;
        serde_json::Number::from_f64(rounded).map_or(Json::Null, Json::Number)
    }
}

fn color(json: &Json) -> Result<Rgba, String> {
    let s = json
        .as_str()
        .ok_or_else(|| format!("expected a colour string, got {json}"))?;
    Rgba::parse_hex(s).ok_or_else(|| format!("expected #RGB, #RRGGBB or #RRGGBBAA, got {s:?}"))
}

fn number(json: &Json) -> Result<f64, String> {
    json.as_f64()
        .ok_or_else(|| format!("expected a number, got {json}"))
}

fn field_number(obj: &serde_json::Map<String, Json>, key: &str) -> Result<f64, String> {
    obj.get(key).map_or(Ok(0.0), number)
}

fn fonts(json: &Json) -> Result<Vec<String>, String> {
    let list = match json {
        Json::String(s) => vec![s.clone()],
        Json::Array(items) => items
            .iter()
            .map(|f| {
                f.as_str()
                    .map(str::to_owned)
                    .ok_or("font families must be strings")
            })
            .collect::<Result<_, _>>()?,
        _ => return Err(format!("expected a list of font families, got {json}")),
    };
    if list.is_empty() {
        return Err("font list is empty".into());
    }
    Ok(list)
}

fn fill(json: &Json) -> Result<Fill, String> {
    if json.is_string() {
        return Ok(Fill::Solid(color(json)?));
    }
    let gradient = json
        .get("gradient")
        .and_then(Json::as_object)
        .ok_or("expected a colour or { \"gradient\": { angle, from, to } }")?;
    Ok(Fill::Gradient {
        angle: field_number(gradient, "angle")?,
        from: color(gradient.get("from").ok_or("gradient needs \"from\"")?)?,
        to: color(gradient.get("to").ok_or("gradient needs \"to\"")?)?,
    })
}

fn shadow(json: &Json) -> Result<Shadow, String> {
    let obj = json
        .as_object()
        .ok_or("expected { x, y, blur, spread, color, inset }")?;
    Ok(Shadow {
        x: field_number(obj, "x")?,
        y: field_number(obj, "y")?,
        blur: field_number(obj, "blur")?,
        spread: field_number(obj, "spread")?,
        color: color(obj.get("color").ok_or("shadow needs \"color\"")?)?,
        inset: obj.get("inset").map_or(Ok(false), |v| {
            v.as_bool().ok_or("\"inset\" must be a boolean")
        })?,
    })
}
