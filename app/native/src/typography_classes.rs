//! The text roles' classes are built at run time in `themes/typography.ts`,
//! where `nsh build` doesn't check them. This reads them from that file and
//! parses each against `theme.json`'s tokens, as the app does at startup.

const TYPOGRAPHY: &str = include_str!("../../themes/typography.ts");
const THEME: &str = include_str!("../../theme.json");
const FONT_CLASS: &str = "font-(family-name:--font-${face})";

/// The size classes among `source`'s string literals (`text-(--text-body)…`).
fn token_classes(source: &str) -> Vec<&str> {
    source
        .split('"')
        .skip(1)
        .step_by(2)
        .filter(|literal| literal.starts_with("text-(--"))
        .collect()
}

/// The faces in `const DRAWN_FACES = ["heading", …]`.
fn drawn_faces(source: &str) -> Vec<&str> {
    let line = source
        .lines()
        .find(|line| line.starts_with("const DRAWN_FACES = ["))
        .expect("typography.ts declares DRAWN_FACES");
    let list = &line[line.find('[').unwrap() + 1..line.find(']').unwrap()];
    list.split(',')
        .map(|face| face.trim().trim_matches('"'))
        .collect()
}

#[test]
fn every_role_and_face_class_resolves_against_the_app_theme() {
    let theme = nsh_base::Theme::from_json(THEME).expect("theme.json parses");
    let mut classes = nsh_core::tailwind::Theme::default();
    classes.set_tokens(theme.tokens());

    assert!(
        TYPOGRAPHY.contains(FONT_CLASS),
        "typography.ts no longer builds face fonts as {FONT_CLASS}: update this test"
    );
    let sizes = token_classes(TYPOGRAPHY);
    let faces = drawn_faces(TYPOGRAPHY);
    assert!(sizes.len() >= 12, "found only {} role classes", sizes.len());
    assert_eq!(faces, ["heading", "button", "numerical"]);

    let fonts = faces.iter().map(|face| FONT_CLASS.replace("${face}", face));
    for class in sizes.iter().map(|class| class.to_string()).chain(fonts) {
        let list = nsh_core::tailwind::parse(&classes, &class);
        assert!(
            list.unknown().is_empty() && !list.is_empty(),
            "`{class}` doesn't resolve: unknown {:?}",
            list.unknown()
        );
    }
}

#[test]
fn a_token_the_theme_lacks_fails_the_check() {
    let theme = nsh_base::Theme::from_json(THEME).unwrap();
    let mut classes = nsh_core::tailwind::Theme::default();
    classes.set_tokens(theme.tokens());
    let list = nsh_core::tailwind::parse(
        &classes,
        "text-(--text-missing)/(--text-missing--line-height)",
    );
    assert!(!list.unknown().is_empty());
}
