//! Parity with the Tauri webview (GPUI_PORT_PLAN.md §4.2): every built-in theme
//! and the sample Omarchy palettes resolve to the values Chromium computed from
//! the old CSS, within ±1/255 per channel. Fixtures come from
//! `just theme-fixtures` (scripts/fixtures/themes/).

use std::path::PathBuf;

use rencal_theme::{
    Derive, EventColors, OmarchyColors, ResolvedTheme, Rgba, TextTransform, Value, builtin,
    event_colors, omarchy_theme, resolve_theme, tokens,
};
use serde_json::Value as Json;

fn fixtures() -> Vec<(String, Json)> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    let mut out: Vec<_> = std::fs::read_dir(&dir)
        .expect("fixtures directory")
        .map(|entry| {
            let path = entry.unwrap().path();
            let json: Json =
                serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
            (json["id"].as_str().unwrap().to_owned(), json)
        })
        .collect();
    out.sort_by(|a, b| a.0.cmp(&b.0));
    assert!(
        out.len() >= 12,
        "expected every built-in plus the Omarchy samples"
    );
    out
}

fn resolved_for(id: &str, fixture: &Json) -> ResolvedTheme {
    let theme = if id.starts_with("omarchy:") {
        let colors: OmarchyColors = serde_json::from_value(fixture["omarchy"].clone()).unwrap();
        let (theme, diagnostics) = omarchy_theme(&colors).compile();
        assert!(diagnostics.is_empty(), "{diagnostics:?}");
        theme
    } else {
        builtin(id)
            .unwrap_or_else(|| panic!("no built-in {id}"))
            .theme
            .clone()
    };
    resolve_theme(&theme).unwrap()
}

fn fixture_color(entry: &Json) -> Rgba {
    Rgba::parse_hex(entry["hex"].as_str().unwrap()).unwrap()
}

fn close(a: Rgba, b: Rgba) -> bool {
    a.to_bytes()
        .iter()
        .zip(b.to_bytes())
        .all(|(x, y)| x.abs_diff(y) <= 1)
}

type EventField = fn(&EventColors) -> Rgba;

#[derive(Default)]
struct Failures(Vec<String>);

impl Failures {
    fn color(&mut self, ctx: &str, got: Option<Rgba>, want: Option<Rgba>) {
        let ok = match (got, want) {
            (Some(g), Some(w)) => close(g, w),
            (None, None) => true,
            _ => false,
        };
        if !ok {
            let show = |c: Option<Rgba>| c.map_or("unset".into(), |c| c.to_hex());
            self.0
                .push(format!("{ctx}: got {}, webview {}", show(got), show(want)));
        }
    }
}

fn parse_fonts(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|f| f.trim().trim_matches('"').to_owned())
        .collect()
}

#[test]
fn resolves_like_the_webview() {
    let mut failures = Failures::default();
    let mut checked = 0;
    for (id, fixture) in fixtures() {
        let resolved = resolved_for(&id, &fixture);
        for def in tokens() {
            let Some(css) = def.css else { continue };
            let ctx = format!("{id} {} (--{css})", def.key);
            if let Some(entry) = fixture["colors"].get(css) {
                // An unset CSS var fell back at the use site; a v2 derivation
                // other than `Unset` encodes that fallback instead.
                if entry.is_null() && !matches!(def.derive, Derive::Unset) {
                    continue;
                }
                let want = (!entry.is_null()).then(|| fixture_color(entry));
                failures.color(&ctx, resolved.optional_color(def.key), want);
                checked += 1;
            } else if let Some(entry) = fixture["lengths"].get(css) {
                // Unset optional metrics fall back at the use site; nothing to compare.
                if let Some(want) = entry.as_f64() {
                    let got = resolved.number(def.key);
                    if (got - want).abs() > 0.01 {
                        failures.0.push(format!("{ctx}: got {got}, webview {want}"));
                    }
                    checked += 1;
                }
            } else if let Some(raw) = fixture["raw"].get(css).and_then(Json::as_str) {
                let ok = match resolved.get(def.key) {
                    Some(Value::Fraction(v)) => {
                        (v * 100.0 - raw.trim_end_matches('%').parse::<f64>().unwrap()).abs() < 1e-9
                    }
                    Some(Value::Fonts(list)) => *list == parse_fonts(raw),
                    Some(Value::Transform(t)) => {
                        *t == if raw == "uppercase" {
                            TextTransform::Uppercase
                        } else {
                            TextTransform::None
                        }
                    }
                    other => panic!("{ctx}: no raw comparison for {other:?}"),
                };
                if !ok {
                    failures.0.push(format!(
                        "{ctx}: got {:?}, webview {raw}",
                        resolved.get(def.key)
                    ));
                }
                checked += 1;
            }
        }
        for (accent, expected) in fixture["events"].as_object().unwrap() {
            let colors = event_colors(Rgba::parse_hex(accent).unwrap(), &resolved);
            let pairs: [(&str, EventField); 14] = [
                ("calendar-event-color", |e| e.color),
                ("calendar-event-fill", |e| e.fill),
                ("calendar-event-selected-fill", |e| e.selected_fill),
                ("calendar-event-foreground", |e| e.text),
                ("calendar-event-tinted-foreground", |e| e.tinted_text),
                ("week.background", |e| e.fill),
                ("week.text", |e| e.text),
                ("week.selected.background", |e| e.selected_fill),
                ("declined.text", |e| e.declined_text),
                ("declined.border", |e| e.color),
                ("draft.background", |e| e.draft_fill),
                ("draft.text", |e| e.draft_text),
                ("draft.ring", |e| e.draft_ring),
                ("create_selection.background", |e| e.create_selection),
            ];
            for (name, get) in pairs {
                let ctx = format!("{id} event {accent} {name}");
                failures.color(
                    &ctx,
                    Some(get(&colors)),
                    Some(fixture_color(&expected[name])),
                );
                checked += 1;
            }
        }
    }
    assert!(
        failures.0.is_empty(),
        "{} of {checked} mismatches:\n{}",
        failures.0.len(),
        failures.0.join("\n")
    );
    assert!(checked > 1000, "only {checked} values compared");
}
