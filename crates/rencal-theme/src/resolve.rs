//! Resolution (§4.2): explicit value → derivation rule → baseline theme of the
//! same appearance.

use std::collections::HashMap;

use crate::color::Rgba;
use crate::theme::{Appearance, Theme};
use crate::tokens::{Derive, Lookup, Pct, Prop, Slot, SlotKey, Src, State, index_of, tokens};
use crate::value::{BorderStyle, Fill, Shadow, TextShadow, TextTransform, Value};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ResolveError {
    /// A derivation chain loops; the keys form the loop.
    Cycle(Vec<&'static str>),
    /// A primitive the theme leaves unset is missing from the baseline too.
    MissingBaseline(&'static str),
    /// A derivation names a token that does not exist (a catalogue bug).
    UnknownToken(&'static str),
}

impl std::fmt::Display for ResolveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ResolveError::Cycle(keys) => write!(f, "derivation cycle: {}", keys.join(" → ")),
            ResolveError::MissingBaseline(key) => write!(f, "baseline does not set `{key}`"),
            ResolveError::UnknownToken(key) => write!(f, "unknown token `{key}` in a derivation"),
        }
    }
}

impl std::error::Error for ResolveError {}

/// Every token's final value.
#[derive(Clone, Debug, PartialEq)]
pub struct ResolvedTheme {
    pub name: String,
    pub appearance: Appearance,
    values: Vec<Option<Value>>,
    slots: HashMap<SlotKey, Value>,
}

/// One slot's style in one state. `None` fields mean "use the component's own default".
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SlotStyle {
    pub fill: Option<Fill>,
    pub text: Option<Rgba>,
    pub border: Option<Rgba>,
    pub border_width: Option<f64>,
    pub border_style: Option<BorderStyle>,
    pub shadow: Option<Vec<Shadow>>,
    pub radius: Option<f64>,
    pub text_shadow: Option<TextShadow>,
    pub gap: Option<f64>,
}

impl ResolvedTheme {
    pub fn get(&self, key: &str) -> Option<&Value> {
        self.values.get(index_of(key)?)?.as_ref()
    }

    /// A colour token. Unset optional colours (`event.*`) and unknown keys are transparent.
    pub fn color(&self, key: &str) -> Rgba {
        debug_assert!(index_of(key).is_some(), "unknown token {key}");
        self.get(key)
            .and_then(Value::as_color)
            .unwrap_or(Rgba::TRANSPARENT)
    }

    /// A colour token that may be unset (`event.color`, `event.background`, `event.text`).
    pub fn optional_color(&self, key: &str) -> Option<Rgba> {
        self.get(key).and_then(Value::as_color)
    }

    /// A pixel, fraction or weight token; 0 when unset.
    pub fn number(&self, key: &str) -> f64 {
        debug_assert!(index_of(key).is_some(), "unknown token {key}");
        self.get(key).and_then(Value::as_number).unwrap_or(0.0)
    }

    pub fn optional_number(&self, key: &str) -> Option<f64> {
        self.get(key).and_then(Value::as_number)
    }

    pub fn fonts(&self, key: &str) -> &[String] {
        match self.get(key) {
            Some(Value::Fonts(list)) => list,
            _ => &[],
        }
    }

    pub fn transform(&self, key: &str) -> TextTransform {
        match self.get(key) {
            Some(Value::Transform(t)) => *t,
            _ => TextTransform::None,
        }
    }

    /// `radius` scaled like the old `rounded-*` steps (sm ×0.6 … 4xl ×2.6).
    pub fn radius_step(&self, factor: f64) -> f64 {
        self.number("radius") * factor
    }

    /// The style for `slot` in `state`. A state inherits every property it does
    /// not set from the slot's stateless style.
    pub fn slot(&self, slot: Slot, state: Option<State>) -> SlotStyle {
        // A token spelled like a slot key (`toast.text`, `control.active.border`)
        // is that key's value, so lookups try the slot map, then the token.
        let lookup = |key: SlotKey| self.slots.get(&key).or_else(|| self.get(&key.key()));
        let get = |prop: Prop| {
            state
                .and_then(|state| {
                    lookup(SlotKey {
                        slot,
                        state: Some(state),
                        prop,
                    })
                })
                .or_else(|| {
                    lookup(SlotKey {
                        slot,
                        state: None,
                        prop,
                    })
                })
        };
        SlotStyle {
            fill: match get(Prop::Fill) {
                Some(Value::Fill(fill)) => Some(fill.clone()),
                Some(Value::Color(color)) => Some(Fill::Solid(*color)),
                _ => None,
            },
            text: get(Prop::Text).and_then(Value::as_color),
            border: get(Prop::Border).and_then(Value::as_color),
            border_width: get(Prop::BorderWidth).and_then(Value::as_number),
            border_style: match get(Prop::BorderStyle) {
                Some(Value::BorderStyle(style)) => Some(*style),
                _ => None,
            },
            shadow: match get(Prop::Shadow) {
                Some(Value::Shadows(list)) => Some(list.clone()),
                _ => None,
            },
            radius: get(Prop::Radius).and_then(Value::as_number),
            text_shadow: match get(Prop::TextShadow) {
                Some(Value::TextShadow(t)) => Some(t.clone()),
                _ => None,
            },
            gap: get(Prop::Gap).and_then(Value::as_number),
        }
    }
}

/// Resolves `theme` against `baseline` (the built-in theme of the same
/// appearance, see [`crate::baseline`]).
pub fn resolve(theme: &Theme, baseline: &Theme) -> Result<ResolvedTheme, ResolveError> {
    let mut resolver = Resolver {
        theme,
        baseline,
        values: vec![Entry::Pending; tokens().len()],
        stack: Vec::new(),
    };
    for index in 0..tokens().len() {
        resolver.resolve(index)?;
    }
    let values = resolver
        .values
        .into_iter()
        .map(|entry| match entry {
            Entry::Done(value) => value,
            Entry::Pending | Entry::InProgress => unreachable!("every token resolved"),
        })
        .collect();
    Ok(ResolvedTheme {
        name: theme.name.clone(),
        appearance: theme.appearance,
        values,
        slots: theme.slots.clone(),
    })
}

#[derive(Clone)]
enum Entry {
    Pending,
    InProgress,
    Done(Option<Value>),
}

struct Resolver<'a> {
    theme: &'a Theme,
    baseline: &'a Theme,
    values: Vec<Entry>,
    stack: Vec<&'static str>,
}

impl Resolver<'_> {
    fn resolve(&mut self, index: usize) -> Result<Option<Value>, ResolveError> {
        let def = tokens()[index];
        match &self.values[index] {
            Entry::Done(value) => return Ok(value.clone()),
            Entry::InProgress => {
                let start = self.stack.iter().position(|k| *k == def.key).unwrap_or(0);
                let mut cycle = self.stack[start..].to_vec();
                cycle.push(def.key);
                return Err(ResolveError::Cycle(cycle));
            }
            Entry::Pending => {}
        }
        self.values[index] = Entry::InProgress;
        self.stack.push(def.key);
        let value = match &self.theme.values[index] {
            Some(value) => Some(value.clone()),
            None => self.derive(def.key, &def.derive)?,
        };
        self.stack.pop();
        self.values[index] = Entry::Done(value.clone());
        Ok(value)
    }

    fn derive(&mut self, key: &'static str, rule: &Derive) -> Result<Option<Value>, ResolveError> {
        Ok(match rule {
            Derive::Baseline => {
                let index = index_of(key).ok_or(ResolveError::UnknownToken(key))?;
                Some(
                    self.baseline.values[index]
                        .clone()
                        .ok_or(ResolveError::MissingBaseline(key))?,
                )
            }
            Derive::Unset => None,
            Derive::Ref(other) => self.get(other)?,
            Derive::Const(c) => Some(c.value()),
            Derive::Mix { a, pct, b } => {
                let a = self.src(*a)?;
                let b = self.src(*b)?;
                let p = match pct {
                    Pct::Fixed(p) => *p,
                    Pct::Steps(n) => n * self.px("surface.tint_step")?,
                };
                Some(Value::Color(a.mix(p, b)))
            }
            Derive::ByAppearance { dark, light } => match self.theme.appearance {
                Appearance::Dark => self.derive(key, dark)?,
                Appearance::Light => self.derive(key, light)?,
            },
            Derive::Offset(other, delta) => Some(Value::Px(self.px(other)? + delta)),
            Derive::Scale(other, factor) => Some(Value::Px(self.px(other)? * factor)),
            Derive::Custom(f) => f(self)?,
        })
    }

    fn src(&mut self, src: Src) -> Result<Rgba, ResolveError> {
        match src {
            Src::Lit(c) => Ok(c),
            Src::Tok(key) => Ok(self
                .get(key)?
                .and_then(|v| v.as_color())
                .unwrap_or(Rgba::TRANSPARENT)),
        }
    }
}

impl Lookup for Resolver<'_> {
    fn get(&mut self, key: &'static str) -> Result<Option<Value>, ResolveError> {
        let index = index_of(key).ok_or(ResolveError::UnknownToken(key))?;
        self.resolve(index)
    }
}
