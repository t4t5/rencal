//! View plugins: the scripts and styles of installed plugin views. The frontend
//! imports each script as a module and registers its default export as a view.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::plugins;

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
pub struct ExternalView {
    /// `<plugin-id>/<view-id>`.
    pub id: String,
    pub plugin_id: String,
    pub name: String,
    pub script: String,
    pub css: Option<String>,
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
                script: view.script,
                css: view.css,
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
css = "dist/board.css"
"#;

    #[test]
    fn scans_installed_view_scripts_and_styles() {
        let temp = tempfile::tempdir().unwrap();
        let package = temp.path().join("alice.board");
        std::fs::create_dir_all(package.join("dist")).unwrap();
        std::fs::write(package.join("rencal-plugin.toml"), MANIFEST).unwrap();
        std::fs::write(package.join("dist/board.js"), "export default () => null").unwrap();
        std::fs::write(package.join("dist/board.css"), ".board {}").unwrap();

        let snapshot = scan_from(temp.path());

        assert_eq!(snapshot.views.len(), 1);
        let view = &snapshot.views[0];
        assert_eq!(view.id, "alice.board/board");
        assert_eq!(view.plugin_id, "alice.board");
        assert_eq!(view.script, "export default () => null");
        assert_eq!(view.css.as_deref(), Some(".board {}"));
    }

    #[test]
    fn skips_packages_with_a_missing_script() {
        let temp = tempfile::tempdir().unwrap();
        let package = temp.path().join("alice.board");
        std::fs::create_dir_all(&package).unwrap();
        std::fs::write(package.join("rencal-plugin.toml"), MANIFEST).unwrap();

        assert!(scan_from(temp.path()).views.is_empty());
    }
}
