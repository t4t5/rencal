//! The `omarchy` theme, painted from the desktop's palette (§4.7). A port of
//! `varsFromColors` in the old `src/hooks/useOmarchyTheme.ts`: it sets
//! primitives only and lets derivation do the rest.

use std::collections::BTreeMap;

use serde_json::Value as Json;

use crate::color::Rgba;
use crate::theme::{Appearance, Style, ThemeContent};

/// Omarchy's palette, normalised by the backend (`omarchy.rs`) from v3 ANSI,
/// v4 semantic or hybrid `colors.toml` files. Colours are `#rrggbb`.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
pub struct OmarchyColors {
    pub mode: Appearance,
    /// Theme slug (`current/theme.name` or the `current/theme` symlink).
    pub name: Option<String>,
    pub background: String,
    pub foreground: String,
    pub bright_foreground: String,
    pub accent: String,
    pub red: String,
    pub green: String,
    pub yellow: String,
    pub blue: String,
}

pub const OMARCHY_THEME_ID: &str = "omarchy";

/// Single-hue Omarchy themes, styled like Electric Blue: the accent for every
/// emphasis, events as a solid accent fill. A design call, so listed by hand.
const MONOCHROME_THEMES: [&str; 4] = ["vantablack", "white", "solitude", "lumon"];

/// Perceived brightness, as the TS version computed it (not WCAG luminance).
fn luminance(hex: &str) -> f64 {
    let [r, g, b, _] = Rgba::parse_hex(hex).unwrap_or(Rgba::BLACK).to_bytes();
    (0.299 * f64::from(r) + 0.587 * f64::from(g) + 0.114 * f64::from(b)) / 255.0
}

pub fn omarchy_theme(c: &OmarchyColors) -> ThemeContent {
    // `bright_foreground` is a brighter body text on some themes and an accent
    // tint on others; take whichever contrasts the background more.
    let bg = luminance(&c.background);
    let fg = if (luminance(&c.bright_foreground) - bg).abs() > (luminance(&c.foreground) - bg).abs()
    {
        c.bright_foreground.as_str()
    } else {
        c.foreground.as_str()
    };
    // Omarchy palettes can be light or dark, so pick fill text from the palette.
    let readable_on = |fill: &str| {
        let l = luminance(fill);
        if (bg - l).abs() >= (luminance(fg) - l).abs() {
            c.background.as_str()
        } else {
            fg
        }
    };
    let monochrome = c
        .name
        .as_deref()
        .is_some_and(|name| MONOCHROME_THEMES.contains(&name));
    let today = if monochrome {
        c.accent.as_str()
    } else {
        c.blue.as_str()
    };
    let brand = if monochrome {
        c.accent.as_str()
    } else {
        c.red.as_str()
    };
    let muted = Rgba::parse_hex(fg)
        .unwrap_or(Rgba::WHITE)
        .mix(0.55, Rgba::TRANSPARENT)
        .to_hex();

    let mut style: Vec<(&str, String)> = vec![
        ("background", c.background.clone()),
        ("text", fg.to_owned()),
        ("primary", c.accent.clone()),
        ("primary.text", readable_on(&c.accent).to_owned()),
        ("today", today.to_owned()),
        ("today.text", readable_on(today).to_owned()),
        ("brand", brand.to_owned()),
        ("brand.text", readable_on(brand).to_owned()),
        (
            "surface.tint",
            if monochrome {
                c.accent.clone()
            } else {
                fg.to_owned()
            },
        ),
        ("text.muted", muted),
        ("success", c.green.clone()),
        ("warning", c.yellow.clone()),
        ("error", c.red.clone()),
        ("error.text", readable_on(&c.red).to_owned()),
    ];
    if monochrome {
        style.extend([
            ("event.color", c.accent.clone()),
            ("event.background", c.accent.clone()),
            ("event.text", c.background.clone()),
        ]);
    }
    let mut style: BTreeMap<String, Json> = style
        .into_iter()
        .map(|(k, v)| (k.to_owned(), Json::String(v)))
        .collect();
    // The webview painted light Omarchy palettes over the dark ren baseline's
    // 5% step, not ren-light's 4%; keep that.
    style.insert("surface.tint_step".into(), Json::from(0.05));
    ThemeContent {
        name: "Omarchy (Auto)".into(),
        appearance: c.mode,
        style: Style(style),
    }
}
