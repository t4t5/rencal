//! Built-in themes, embedded from `themes/*.json`.

use std::sync::OnceLock;

use crate::resolve::{ResolveError, ResolvedTheme, resolve};
use crate::theme::{Appearance, Theme, ThemeFamily, slugify};

/// `(file stem, contents, listed in the picker)`, in picker order.
const FILES: &[(&str, &str, bool)] = &[
    ("ren", include_str!("../themes/ren.json"), true),
    (
        "catpuccin-latte",
        include_str!("../themes/catpuccin-latte.json"),
        true,
    ),
    (
        "tokyonight",
        include_str!("../themes/tokyonight.json"),
        true,
    ),
    ("classic", include_str!("../themes/classic.json"), true),
    ("nord", include_str!("../themes/nord.json"), true),
    (
        "electric-blue",
        include_str!("../themes/electric-blue.json"),
        true,
    ),
    ("minimal", include_str!("../themes/minimal.json"), true),
    // Internal contrast probe with deliberately clashing surfaces; dev only.
    (
        "contract-debug",
        include_str!("../themes/contract-debug.json"),
        false,
    ),
];

/// The dark baseline. Its light sibling in the same family is the light baseline.
pub const DARK_BASELINE_ID: &str = "ren";
pub const LIGHT_BASELINE_ID: &str = "ren-light";

#[derive(Debug)]
pub struct BuiltinTheme {
    pub id: String,
    pub theme: Theme,
    /// False for dev-only themes kept out of the picker.
    pub listed: bool,
}

/// Theme ids for a family file: the file stem for a one-variant family, else
/// each variant's slugified name (`ren.json` → `ren`, `ren-light`).
pub fn variant_ids(stem: &str, family: &ThemeFamily) -> Vec<String> {
    if family.themes.len() == 1 {
        vec![stem.to_owned()]
    } else {
        family.themes.iter().map(|t| slugify(&t.name)).collect()
    }
}

/// Every built-in variant. Built-ins are checked by tests to parse without
/// diagnostics, so a bad one here is a build bug.
pub fn builtin_themes() -> &'static [BuiltinTheme] {
    static THEMES: OnceLock<Vec<BuiltinTheme>> = OnceLock::new();
    THEMES.get_or_init(|| {
        let mut out = Vec::new();
        for (stem, json, listed) in FILES {
            let family = ThemeFamily::from_json(json)
                .unwrap_or_else(|e| panic!("built-in theme {stem}.json: {e}"));
            for (id, content) in variant_ids(stem, &family).into_iter().zip(&family.themes) {
                let (theme, _) = content.compile();
                out.push(BuiltinTheme {
                    id,
                    theme,
                    listed: *listed,
                });
            }
        }
        out
    })
}

pub fn builtin(id: &str) -> Option<&'static BuiltinTheme> {
    builtin_themes().iter().find(|t| t.id == id)
}

/// The theme whose primitives fill in what a theme of `appearance` leaves unset.
pub fn baseline(appearance: Appearance) -> &'static Theme {
    let id = match appearance {
        Appearance::Dark => DARK_BASELINE_ID,
        Appearance::Light => LIGHT_BASELINE_ID,
    };
    &builtin(id).expect("baseline themes are built in").theme
}

/// Resolves `theme` against the built-in baseline of its appearance.
pub fn resolve_theme(theme: &Theme) -> Result<ResolvedTheme, ResolveError> {
    resolve(theme, baseline(theme.appearance))
}
