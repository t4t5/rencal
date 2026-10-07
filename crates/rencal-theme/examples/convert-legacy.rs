//! Converts legacy CSS themes to v2 JSON.
//!
//! cargo run -p rencal-theme --features legacy-css --example convert-legacy -- \
//!     <light|dark> <Name> <file.css> [<light|dark> <Name> <file.css> ...] > family.json
//!
//! Several triples make one family with several variants. Diagnostics go to stderr.

use rencal_theme::legacy::{convert, family};
use rencal_theme::{Appearance, baseline};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() || !args.len().is_multiple_of(3) {
        eprintln!("usage: convert-legacy <light|dark> <Name> <file.css> [...]");
        std::process::exit(2);
    }
    // Converting the baselines themselves (ren, ren-light) pins every primitive.
    let is_baseline = std::env::var_os("RENCAL_CONVERT_BASELINE").is_some();
    let mut variants = Vec::new();
    for triple in args.chunks(3) {
        let appearance = match triple[0].as_str() {
            "light" => Appearance::Light,
            "dark" => Appearance::Dark,
            other => panic!("appearance must be light or dark, got {other}"),
        };
        let css = std::fs::read_to_string(&triple[2]).expect("read theme file");
        let base = (!is_baseline).then(|| baseline(appearance));
        let (content, diagnostics) = convert(&css, &triple[1], appearance, base);
        for d in diagnostics {
            eprintln!("{}: {d}", triple[2]);
        }
        variants.push(content);
    }
    let name = variants[0].name.clone();
    print!(
        "{}",
        family(&name, Some("renCal"), variants).to_json_pretty()
    );
}
