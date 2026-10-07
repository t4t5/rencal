use std::path::PathBuf;

use rencal_theme::{
    Appearance, Derive, ResolveError, ThemeContent, ThemeFamily, baseline, builtin_themes, resolve,
    resolve_theme, theme_schema_string, tokens,
};

fn crate_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

#[test]
fn every_builtin_loads_without_diagnostics() {
    for entry in std::fs::read_dir(crate_dir().join("themes")).unwrap() {
        let path = entry.unwrap().path();
        let family = ThemeFamily::from_json(&std::fs::read_to_string(&path).unwrap())
            .unwrap_or_else(|e| panic!("{}: {e}", path.display()));
        for variant in &family.themes {
            let (_, diagnostics) = variant.compile();
            assert!(
                diagnostics.is_empty(),
                "{}: {diagnostics:?}",
                path.display()
            );
        }
    }
    let ids: Vec<_> = builtin_themes().iter().map(|t| t.id.as_str()).collect();
    assert_eq!(
        ids,
        [
            "ren",
            "ren-light",
            "catpuccin-latte",
            "tokyonight",
            "classic",
            "nord",
            "electric-blue",
            "minimal",
            "contract-debug"
        ]
    );
    assert!(
        builtin_themes()
            .iter()
            .all(|t| t.listed == (t.id != "contract-debug"))
    );
}

/// Resolving visits every derivation, so a cycle anywhere in the catalogue fails here.
#[test]
fn every_builtin_resolves_without_cycles() {
    for builtin in builtin_themes() {
        resolve_theme(&builtin.theme).unwrap_or_else(|e| panic!("{}: {e}", builtin.id));
    }
}

#[test]
fn a_missing_baseline_primitive_is_reported() {
    let (empty, _) = ThemeContent {
        name: "Empty".into(),
        appearance: Appearance::Dark,
        style: Default::default(),
    }
    .compile();
    let err = resolve(&empty, &empty).unwrap_err();
    assert!(matches!(err, ResolveError::MissingBaseline(_)), "{err:?}");
}

#[test]
fn baselines_set_every_primitive() {
    for appearance in [Appearance::Dark, Appearance::Light] {
        let theme = baseline(appearance);
        for def in tokens()
            .iter()
            .filter(|t| matches!(t.derive, Derive::Baseline))
        {
            assert!(
                theme.explicit(def.key).is_some(),
                "{appearance:?} baseline lacks {}",
                def.key
            );
        }
    }
}

#[test]
fn derivations_name_real_tokens() {
    fn check(rule: &Derive) {
        match rule {
            Derive::Ref(k) | Derive::Offset(k, _) | Derive::Scale(k, _) => {
                assert!(rencal_theme::token(k).is_some(), "unknown {k}")
            }
            Derive::Mix { a, b, .. } => {
                for src in [a, b] {
                    if let rencal_theme::Src::Tok(k) = src {
                        assert!(rencal_theme::token(k).is_some(), "unknown {k}");
                    }
                }
            }
            Derive::ByAppearance { dark, light } => {
                check(dark);
                check(light);
            }
            _ => {}
        }
    }
    for def in tokens() {
        check(&def.derive);
    }
}

#[test]
fn schema_is_up_to_date() {
    let path = crate_dir().join("schema/v1.json");
    let generated = theme_schema_string();
    if std::env::var_os("UPDATE_SCHEMA").is_some() {
        std::fs::write(&path, &generated).unwrap();
    }
    let committed = std::fs::read_to_string(&path).unwrap_or_default();
    assert!(
        committed == generated,
        "schema/v1.json is stale; run `UPDATE_SCHEMA=1 cargo test -p rencal-theme --test builtins`"
    );
}

#[test]
fn families_round_trip_through_json() {
    for builtin in builtin_themes() {
        let content = ThemeContent::from_theme(&builtin.theme);
        let json = serde_json::to_string(&content).unwrap();
        let back: ThemeContent = serde_json::from_str(&json).unwrap();
        let (theme, diagnostics) = back.compile();
        assert!(diagnostics.is_empty());
        assert_eq!(theme, builtin.theme, "{}", builtin.id);
    }
}
