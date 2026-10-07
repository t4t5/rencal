//! Legacy CSS theme → v2 converter (feature `legacy-css`).
//!
//! A legacy theme is a bare block of CSS custom properties evaluated on top of
//! the old `src/global.css` baseline. The converter evaluates it the way the
//! webview did (textual `var()` substitution, `color-mix(in srgb)`, `calc()`,
//! `oklch()`), then emits the smallest v2 theme that resolves to the same
//! values: every declared token, plus any token whose v2 derivation would
//! otherwise differ. Custom selector rules can't be converted; they're reported.

use std::collections::HashMap;

use crate::color::{Oklch, Rgba};
use crate::resolve::resolve;
use crate::theme::{Appearance, Diagnostic, Theme, ThemeContent, ThemeFamily};
use crate::tokens::tokens;
use crate::value::{Kind, TextTransform, Value};

const BASELINE: &str = include_str!("legacy_baseline.css");

/// A parsed legacy theme file.
#[derive(Clone, Debug, Default)]
pub struct LegacySheet {
    /// `--name` (without dashes) → value text, in file order.
    pub declarations: Vec<(String, String)>,
    /// Nested selector rules, verbatim. Not convertible.
    pub rules: Vec<String>,
    /// Top-level declarations of ordinary CSS properties. Not convertible.
    pub properties: Vec<String>,
    /// `/* @name ... */`
    pub name: Option<String>,
    /// `/* @appearance light|dark */`
    pub appearance: Option<Appearance>,
}

pub fn parse_sheet(css: &str) -> LegacySheet {
    let mut sheet = LegacySheet::default();
    let mut text = String::with_capacity(css.len());
    let mut rest = css;
    while let Some(start) = rest.find("/*") {
        text.push_str(&rest[..start]);
        let end = rest[start..]
            .find("*/")
            .map_or(rest.len(), |e| start + e + 2);
        let comment = rest[start + 2..end.saturating_sub(2).max(start + 2)].trim();
        if let Some(name) = comment.strip_prefix("@name") {
            sheet.name = Some(name.trim().to_owned());
        } else if let Some(appearance) = comment.strip_prefix("@appearance") {
            sheet.appearance = match appearance.trim() {
                "light" => Some(Appearance::Light),
                "dark" => Some(Appearance::Dark),
                _ => None,
            };
        }
        rest = &rest[end..];
    }
    text.push_str(rest);

    let mut start = 0;
    let mut depth = 0usize;
    let mut paren = 0usize;
    for (i, c) in text.char_indices() {
        match c {
            '(' => paren += 1,
            ')' => paren = paren.saturating_sub(1),
            '{' if paren == 0 => depth += 1,
            '}' if paren == 0 && depth > 0 => {
                depth -= 1;
                if depth == 0 {
                    sheet.rules.push(text[start..=i].trim().to_owned());
                    start = i + 1;
                }
            }
            ';' if depth == 0 && paren == 0 => {
                push_declaration(&mut sheet, &text[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    push_declaration(&mut sheet, &text[start..]);
    sheet
}

fn push_declaration(sheet: &mut LegacySheet, decl: &str) {
    let decl = decl.trim();
    if decl.is_empty() {
        return;
    }
    match decl.split_once(':') {
        Some((name, value)) if name.trim().starts_with("--") => sheet
            .declarations
            .push((name.trim()[2..].to_owned(), value.trim().to_owned())),
        _ => sheet.properties.push(decl.to_owned()),
    }
}

/// Custom properties in scope for one theme: baseline, light rules, theme.
struct Env {
    vars: HashMap<String, String>,
}

impl Env {
    fn new(sheet: &LegacySheet, appearance: Appearance) -> Env {
        let (base, light) = BASELINE
            .split_once("/* @light */")
            .expect("baseline has a light section");
        let mut vars = HashMap::new();
        let mut layers = vec![parse_sheet(base)];
        if appearance == Appearance::Light {
            layers.push(parse_sheet(light));
        }
        for layer in layers.iter().chain(std::iter::once(sheet)) {
            for (name, value) in &layer.declarations {
                vars.insert(name.clone(), value.clone());
            }
        }
        Env { vars }
    }

    /// The var's value with every `var()` substituted; `None` when unset
    /// (`initial`, missing, or a cycle) — CSS's "guaranteed-invalid value".
    fn substituted(&self, name: &str, stack: &mut Vec<String>) -> Option<String> {
        if stack.iter().any(|n| n == name) {
            return None;
        }
        let raw = self.vars.get(name)?.trim();
        if raw == "initial" {
            return None;
        }
        stack.push(name.to_owned());
        let out = self.substitute(raw, stack);
        stack.pop();
        out
    }

    fn substitute(&self, text: &str, stack: &mut Vec<String>) -> Option<String> {
        let mut out = String::new();
        let mut rest = text;
        while let Some(pos) = rest.find("var(") {
            out.push_str(&rest[..pos]);
            let close = matching_paren(rest, pos + 3)?;
            let inner = &rest[pos + 4..close];
            let (name, fallback) = match split_top_level(inner, ',').as_slice() {
                [name] => (name.trim(), None),
                [name, ..] => (name.trim(), Some(inner[inner.find(',')? + 1..].trim())),
                [] => return None,
            };
            let name = name.strip_prefix("--")?;
            let value = match self.substituted(name, stack) {
                Some(value) => value,
                None => self.substitute(fallback?, stack)?,
            };
            out.push_str(&value);
            rest = &rest[close + 1..];
        }
        out.push_str(rest);
        Some(out)
    }

    fn eval(&self, name: &str, kind: Kind) -> Result<Option<Value>, String> {
        let Some(text) = self.substituted(name, &mut Vec::new()) else {
            return Ok(None);
        };
        eval_text(&text, kind).map(Some)
    }
}

fn matching_paren(s: &str, open: usize) -> Option<usize> {
    let mut depth = 0;
    for (i, c) in s[open..].char_indices() {
        match c {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(open + i);
                }
            }
            _ => {}
        }
    }
    None
}

fn split_top_level(s: &str, sep: char) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0;
    let mut start = 0;
    for (i, c) in s.char_indices() {
        match c {
            '(' => depth += 1,
            ')' => depth -= 1,
            c if c == sep && depth == 0 => {
                parts.push(&s[start..i]);
                start = i + c.len_utf8();
            }
            _ => {}
        }
    }
    parts.push(&s[start..]);
    parts
}

fn eval_text(text: &str, kind: Kind) -> Result<Value, String> {
    let text = text.trim();
    Ok(match kind {
        Kind::Color | Kind::Fill => {
            let c = eval_color(text)?;
            if kind == Kind::Fill {
                Value::Fill(crate::value::Fill::Solid(c))
            } else {
                Value::Color(c)
            }
        }
        Kind::Fraction => {
            let (v, unit) = eval_number(text)?;
            Value::Fraction(if unit == Unit::Percent { v / 100.0 } else { v })
        }
        Kind::Px => match text {
            // Legacy --scrollbar-width keywords.
            "none" => Value::Px(0.0),
            "thin" => Value::Px(8.0),
            "auto" => Value::Px(12.0),
            _ => Value::Px(eval_number(text)?.0),
        },
        Kind::Weight => Value::Weight(eval_number(text)?.0),
        Kind::Fonts => Value::Fonts(
            split_top_level(text, ',')
                .into_iter()
                .map(|f| f.trim().trim_matches(['"', '\'']).to_owned())
                .filter(|f| !f.is_empty())
                .collect(),
        ),
        Kind::Transform => Value::Transform(match text {
            "uppercase" => TextTransform::Uppercase,
            "none" | "normal" => TextTransform::None,
            other => return Err(format!("unsupported text-transform {other:?}")),
        }),
        Kind::BorderStyle | Kind::Shadows | Kind::TextShadow => {
            return Err("not expressible as a custom property".into());
        }
    })
}

fn eval_color(text: &str) -> Result<Rgba, String> {
    let text = text.trim();
    match text.to_ascii_lowercase().as_str() {
        "white" => return Ok(Rgba::WHITE),
        "black" => return Ok(Rgba::BLACK),
        "transparent" => return Ok(Rgba::TRANSPARENT),
        _ => {}
    }
    if text.starts_with('#') {
        return Rgba::parse_hex(text).ok_or_else(|| format!("bad hex colour {text:?}"));
    }
    let open = text
        .find('(')
        .ok_or_else(|| format!("unsupported colour {text:?}"))?;
    let func = text[..open].trim().to_ascii_lowercase();
    let close = matching_paren(text, open).ok_or("unbalanced parentheses")?;
    let inner = &text[open + 1..close];
    match func.as_str() {
        "color-mix" => {
            let args = split_top_level(inner, ',');
            let [space, a, b] = args.as_slice() else {
                return Err(format!("color-mix needs three arguments: {text:?}"));
            };
            if space.trim() != "in srgb" {
                return Err(format!("only `in srgb` mixes are supported: {text:?}"));
            }
            let (ca, pa) = mix_operand(a)?;
            let (cb, pb) = mix_operand(b)?;
            let p = match (pa, pb) {
                (Some(pa), _) => pa,
                (None, Some(pb)) => 1.0 - pb,
                (None, None) => 0.5,
            };
            Ok(ca.mix(p, cb))
        }
        "rgb" | "rgba" => {
            let (channels, alpha) = channels(inner)?;
            let [r, g, b] = channels.as_slice() else {
                return Err(format!("bad rgb(): {text:?}"));
            };
            let c = |(v, unit): (f64, Unit)| {
                if unit == Unit::Percent {
                    v / 100.0
                } else {
                    v / 255.0
                }
            };
            Ok(Rgba::new(c(*r), c(*g), c(*b), alpha))
        }
        "oklch" => {
            let (channels, alpha) = channels(inner)?;
            let [l, c, h] = channels.as_slice() else {
                return Err(format!("bad oklch(): {text:?}"));
            };
            let l = if l.1 == Unit::Percent {
                l.0 / 100.0
            } else {
                l.0
            };
            let c = if c.1 == Unit::Percent {
                c.0 / 100.0 * 0.4
            } else {
                c.0
            };
            Ok(Oklch {
                l,
                c,
                h: h.0,
                alpha,
            }
            .to_rgba())
        }
        _ => Err(format!("unsupported colour function {func:?}")),
    }
}

/// `A 20%` → (A, Some(0.2)).
fn mix_operand(arg: &str) -> Result<(Rgba, Option<f64>), String> {
    let arg = arg.trim();
    // The percentage, if any, is the last top-level space-separated part.
    let parts = split_top_level(arg, ' ');
    if parts.len() > 1 {
        let last = parts.last().expect("non-empty").trim();
        if let Ok((v, Unit::Percent)) = eval_number(last) {
            let color = arg[..arg.len() - last.len()].trim();
            return Ok((eval_color(color)?, Some(v / 100.0)));
        }
    }
    Ok((eval_color(arg)?, None))
}

/// Space- or comma-separated channels with an optional alpha (`/ a` or a fourth value).
fn channels(inner: &str) -> Result<(Vec<(f64, Unit)>, f64), String> {
    let (main, alpha) = match inner.split_once('/') {
        Some((main, alpha)) => (main, Some(alpha)),
        None => (inner, None),
    };
    let mut values: Vec<(f64, Unit)> = main
        .split(|c: char| c == ',' || c.is_whitespace())
        .filter(|p| !p.is_empty())
        .map(eval_number)
        .collect::<Result<_, _>>()?;
    let alpha = match alpha {
        Some(a) => Some(eval_number(a.trim())?),
        None if values.len() == 4 => values.pop(),
        None => None,
    };
    let alpha = alpha.map_or(
        1.0,
        |(v, unit)| if unit == Unit::Percent { v / 100.0 } else { v },
    );
    Ok((values, alpha))
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Unit {
    None,
    Px,
    Percent,
}

/// Evaluates a number, length or percentage, including `calc()`, `max()` and `min()`.
fn eval_number(text: &str) -> Result<(f64, Unit), String> {
    let mut parser = NumParser {
        s: text.trim().as_bytes(),
        i: 0,
    };
    let v = parser.expr()?;
    parser.ws();
    if parser.i != parser.s.len() {
        return Err(format!("unexpected input in {text:?}"));
    }
    Ok(v)
}

struct NumParser<'a> {
    s: &'a [u8],
    i: usize,
}

impl NumParser<'_> {
    fn ws(&mut self) {
        while self.s.get(self.i).is_some_and(u8::is_ascii_whitespace) {
            self.i += 1;
        }
    }

    fn expr(&mut self) -> Result<(f64, Unit), String> {
        let mut acc = self.term()?;
        loop {
            self.ws();
            match self.s.get(self.i) {
                Some(b'+') => {
                    self.i += 1;
                    let rhs = self.term()?;
                    acc = (acc.0 + rhs.0, unit(acc.1, rhs.1));
                }
                Some(b'-') => {
                    self.i += 1;
                    let rhs = self.term()?;
                    acc = (acc.0 - rhs.0, unit(acc.1, rhs.1));
                }
                _ => return Ok(acc),
            }
        }
    }

    fn term(&mut self) -> Result<(f64, Unit), String> {
        let mut acc = self.atom()?;
        loop {
            self.ws();
            match self.s.get(self.i) {
                Some(b'*') => {
                    self.i += 1;
                    let rhs = self.atom()?;
                    acc = (acc.0 * rhs.0, unit(acc.1, rhs.1));
                }
                Some(b'/') => {
                    self.i += 1;
                    let rhs = self.atom()?;
                    acc = (acc.0 / rhs.0, unit(acc.1, rhs.1));
                }
                _ => return Ok(acc),
            }
        }
    }

    fn atom(&mut self) -> Result<(f64, Unit), String> {
        self.ws();
        let rest = std::str::from_utf8(&self.s[self.i..]).map_err(|e| e.to_string())?;
        for func in ["calc(", "max(", "min(", "("] {
            if let Some(after) = rest.strip_prefix(func) {
                let close = matching_paren(rest, func.len() - 1).ok_or("unbalanced parentheses")?;
                let inner = &after[..close - func.len()];
                self.i += close + 1;
                let args = split_top_level(inner, ',')
                    .into_iter()
                    .map(eval_number)
                    .collect::<Result<Vec<_>, _>>()?;
                let fold = |pick: fn(f64, f64) -> f64| {
                    args.iter()
                        .copied()
                        .reduce(|a, b| (pick(a.0, b.0), unit(a.1, b.1)))
                        .ok_or("empty function")
                };
                return Ok(match func {
                    "max(" => fold(f64::max)?,
                    "min(" => fold(f64::min)?,
                    _ => *args.first().ok_or("empty calc()")?,
                });
            }
        }
        let len = rest
            .find(|c: char| !(c.is_ascii_digit() || c == '.' || c == '-' || c == '+' || c == 'e'))
            .unwrap_or(rest.len());
        let (num, tail) = rest.split_at(len);
        let value: f64 = num
            .parse()
            .map_err(|_| format!("expected a number at {rest:?}"))?;
        let (unit, unit_len) = if tail.starts_with("px") {
            (Unit::Px, 2)
        } else if tail.starts_with("rem") {
            self.i += len + 3;
            return Ok((value * 16.0, Unit::Px));
        } else if tail.starts_with('%') {
            (Unit::Percent, 1)
        } else {
            (Unit::None, 0)
        };
        self.i += len + unit_len;
        Ok((value, unit))
    }
}

fn unit(a: Unit, b: Unit) -> Unit {
    if a == Unit::None { b } else { a }
}

/// Converts one legacy theme. `baseline` is the v2 theme unset primitives come
/// from (the built-in baseline of `appearance`); `None` converts a baseline
/// itself, which then carries every primitive explicitly.
pub fn convert(
    css: &str,
    name: &str,
    appearance: Appearance,
    baseline: Option<&Theme>,
) -> (ThemeContent, Vec<Diagnostic>) {
    let sheet = parse_sheet(css);
    let appearance = sheet.appearance.unwrap_or(appearance);
    let name = sheet.name.clone().unwrap_or_else(|| name.to_owned());
    let env = Env::new(&sheet, appearance);
    let mut diagnostics = Vec::new();
    let mut report = |key: &str, message: String| {
        diagnostics.push(Diagnostic {
            theme: name.clone(),
            key: key.to_owned(),
            message,
        });
    };
    for rule in &sheet.rules {
        let selector = rule.split('{').next().unwrap_or(rule).trim();
        report(
            selector,
            "custom selector rules can't be converted; use style tokens".into(),
        );
    }
    for property in &sheet.properties {
        report(property, "plain CSS properties can't be converted".into());
    }
    let declared: HashMap<&str, &str> = sheet
        .declarations
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    for dropped in declared
        .keys()
        .filter(|k| k.ends_with("--letter-spacing") || **k == "week-grid-background")
    {
        report(&format!("--{dropped}"), "no v2 equivalent; dropped".into());
    }

    // What the webview computed for each token.
    let mut expected: Vec<Option<Value>> = Vec::new();
    for def in tokens() {
        let value = match def.css {
            Some(css) => env.eval(css, def.kind).unwrap_or_else(|e| {
                report(&format!("--{css}"), e);
                None
            }),
            None => None,
        };
        expected.push(value);
    }

    let mut theme = Theme {
        name: name.clone(),
        appearance,
        values: vec![None; tokens().len()],
        slots: HashMap::new(),
    };
    for (i, def) in tokens().iter().enumerate() {
        let is_declared = def.css.is_some_and(|css| declared.contains_key(css));
        let is_primitive = matches!(def.derive, crate::tokens::Derive::Baseline);
        if is_declared || (baseline.is_none() && is_primitive) {
            theme.values[i] = expected[i].clone();
        }
    }
    // Pin every token whose v2 derivation lands elsewhere, until stable.
    for _ in 0..8 {
        let base = baseline.unwrap_or(&theme).clone();
        let resolved = match resolve(&theme, &base) {
            Ok(resolved) => resolved,
            Err(e) => {
                report("", e.to_string());
                break;
            }
        };
        let mut changed = false;
        for (i, def) in tokens().iter().enumerate() {
            if def.css.is_none() || theme.values[i].is_some() {
                continue;
            }
            if !same(resolved.get(def.key), expected[i].as_ref()) {
                theme.values[i] = expected[i].clone();
                changed = changed || expected[i].is_some();
            }
        }
        if !changed {
            break;
        }
    }
    // Then drop declarations the derivation reproduces anyway (a theme restating
    // the default transform, a `--button-border: var(--border)`).
    if let Some(base) = baseline {
        for i in 0..tokens().len() {
            let Some(value) = theme.values[i].take() else {
                continue;
            };
            let reproduced = resolve(&theme, base).is_ok_and(|resolved| {
                tokens()
                    .iter()
                    .zip(&expected)
                    .all(|(def, want)| want.is_none() || same(resolved.get(def.key), want.as_ref()))
            });
            if !reproduced {
                theme.values[i] = Some(value);
            }
        }
    }
    (ThemeContent::from_theme(&theme), diagnostics)
}

fn same(a: Option<&Value>, b: Option<&Value>) -> bool {
    match (a, b) {
        (Some(Value::Color(a)), Some(Value::Color(b))) => a.to_bytes() == b.to_bytes(),
        (Some(a), Some(b)) => match (a.as_number(), b.as_number()) {
            (Some(x), Some(y)) => (x - y).abs() < 1e-6,
            _ => a == b,
        },
        (None, None) => true,
        _ => false,
    }
}

/// Wraps converted variants in a family file.
pub fn family(name: &str, author: Option<&str>, themes: Vec<ThemeContent>) -> ThemeFamily {
    ThemeFamily {
        schema: Some(crate::theme::SCHEMA_URL.to_owned()),
        name: name.to_owned(),
        author: author.map(str::to_owned),
        themes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_declarations_rules_and_annotations() {
        let sheet = parse_sheet(
            "/* @name Mine */\n/* @appearance light */\n--a: 1px;\n--b: color-mix(in srgb, red 5%, blue);\n[data-slot=\"x\"] { gap: 6px; }\ncolor: red;",
        );
        assert_eq!(sheet.name.as_deref(), Some("Mine"));
        assert_eq!(sheet.appearance, Some(Appearance::Light));
        assert_eq!(sheet.declarations.len(), 2);
        assert_eq!(sheet.rules.len(), 1);
        assert_eq!(sheet.properties, ["color: red"]);
    }

    #[test]
    fn evaluates_numbers() {
        assert_eq!(eval_number("calc(0.25rem * 3)").unwrap().0, 12.0);
        assert_eq!(eval_number("max(0px, 12px - 0.25rem * 2)").unwrap().0, 4.0);
        assert_eq!(eval_number("calc(5% * 3)").unwrap(), (15.0, Unit::Percent));
    }

    #[test]
    fn evaluates_colours() {
        assert_eq!(
            eval_color("rgb(0 0 0 / 0.5)").unwrap().to_hex(),
            "#00000080"
        );
        assert_eq!(
            eval_color("color-mix(in srgb, #ffffff calc(5% * 3), transparent)")
                .unwrap()
                .to_hex(),
            "#ffffff26"
        );
        assert_eq!(
            eval_color("oklch(0.552 0.016 285.938)").unwrap().to_hex(),
            "#71717bff"
        );
    }
}
