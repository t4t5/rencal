//! View plugins: the NSH bundles of installed plugin views, each run in an
//! engine of its own by `rencal.plugin-view` (`plugin_view.rs`).

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::plugins;

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
pub struct ExternalView {
    /// `<plugin-id>/<view-id>`.
    pub id: String,
    pub plugin_id: String,
    pub name: String,
    /// The absolute path of the view's NSH bundle; `None` for a view with
    /// only a React script, which this renCal can't run.
    pub bundle: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, Type)]
pub struct ExternalViewsSnapshot {
    pub views: Vec<ExternalView>,
}

fn scan_from(plugins_dir: &std::path::Path) -> ExternalViewsSnapshot {
    // Broken packages are reported with the theme snapshot's errors.
    let packages = plugins::scan_packages(plugins_dir, plugins::running_app_version().as_ref());
    let views = packages
        .packages
        .into_iter()
        .flat_map(|package| {
            package.views.into_iter().map(move |view| ExternalView {
                id: view.id,
                plugin_id: package.id.clone(),
                name: view.name,
                bundle: view.bundle.map(|path| path.to_string_lossy().into_owned()),
            })
        })
        .collect();
    ExternalViewsSnapshot { views }
}

pub fn scan() -> ExternalViewsSnapshot {
    plugins::plugins_dir()
        .map(|dir| scan_from(&dir))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::scan_from;

    const MANIFEST: &str = r#"
id = "alice.board"
name = "Board"
description = "A board view"
min_rencal_version = "0.8.0"

[[contributes.views]]
id = "board"
name = "Board"
script = "dist/board.js"
bundle = "dist/board.nsh.js"
"#;

    #[test]
    fn scans_installed_view_bundles() {
        let temp = tempfile::tempdir().unwrap();
        let package = temp.path().join("alice.board");
        std::fs::create_dir_all(package.join("dist")).unwrap();
        std::fs::write(package.join("rencal-plugin.toml"), MANIFEST).unwrap();
        std::fs::write(package.join("dist/board.nsh.js"), "mount(() => null)").unwrap();

        let snapshot = scan_from(temp.path());

        assert_eq!(snapshot.views.len(), 1);
        let view = &snapshot.views[0];
        assert_eq!(view.id, "alice.board/board");
        assert_eq!(view.plugin_id, "alice.board");
        let bundle = package.join("dist/board.nsh.js");
        assert_eq!(view.bundle.as_deref(), Some(bundle.to_str().unwrap()));
    }

    #[test]
    fn keeps_react_only_views_without_a_bundle() {
        let temp = tempfile::tempdir().unwrap();
        let package = temp.path().join("alice.board");
        std::fs::create_dir_all(&package).unwrap();
        let manifest = MANIFEST.replace("bundle = \"dist/board.nsh.js\"\n", "");
        std::fs::write(package.join("rencal-plugin.toml"), manifest).unwrap();

        let snapshot = scan_from(temp.path());

        assert_eq!(snapshot.views.len(), 1);
        assert!(snapshot.views[0].bundle.is_none());
    }

    #[test]
    fn skips_packages_with_a_missing_bundle() {
        let temp = tempfile::tempdir().unwrap();
        let package = temp.path().join("alice.board");
        std::fs::create_dir_all(&package).unwrap();
        std::fs::write(package.join("rencal-plugin.toml"), MANIFEST).unwrap();

        assert!(scan_from(temp.path()).views.is_empty());
    }
}
