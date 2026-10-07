//! The plugin list (port of `plugin-list.ts` and the sorting/filtering in
//! `PluginsPage.tsx`): catalog entries merged with their installed state,
//! then local and unlisted plugins.

use std::cmp::Ordering;

use rencal_core::plugins::{ContributionKind, InstalledPlugin, InstalledPlugins, PluginCatalog};

#[derive(Clone, Debug, PartialEq)]
pub struct PluginListItem {
    pub id: String,
    pub name: String,
    pub repo: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub preview_url: Option<String>,
    pub contributions: Vec<ContributionKind>,
    pub stars: u32,
    pub released_at: Option<String>,
    /// In the renCal catalog.
    pub listed: bool,
    pub installed: Option<InstalledPlugin>,
}

/// Deep links only know the repo, so a selection is resolved against the
/// latest lists.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PluginSelection {
    pub id: Option<String>,
    pub repo: Option<String>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum PluginSort {
    #[default]
    Stars,
    Latest,
}

impl PluginSort {
    pub fn label(self) -> &'static str {
        match self {
            Self::Stars => "Most starred",
            Self::Latest => "Latest",
        }
    }
}

pub fn contribution_label(kind: ContributionKind) -> &'static str {
    match kind {
        ContributionKind::Theme => "Theme",
        ContributionKind::Provider => "Provider",
    }
}

impl PluginListItem {
    pub fn owner(&self) -> &str {
        match &self.repo {
            Some(repo) => repo.split('/').next().unwrap_or(repo),
            None => self.id.split('.').next().unwrap_or(&self.id),
        }
    }

    pub fn is_provider(&self) -> bool {
        self.contributions.contains(&ContributionKind::Provider)
    }

    pub fn selection(&self) -> PluginSelection {
        PluginSelection {
            id: Some(self.id.clone()),
            repo: self.repo.clone(),
        }
    }

    fn matches(&self, query: &str) -> bool {
        let haystack = format!(
            "{} {} {} {} {}",
            self.name,
            self.repo.as_deref().unwrap_or(""),
            self.installed
                .as_ref()
                .and_then(|installed| installed.local_dir.as_deref())
                .unwrap_or(""),
            self.description.as_deref().unwrap_or(""),
            if self.is_provider() { "provider" } else { "" },
        );
        haystack.to_lowercase().contains(query)
    }
}

/// Releases show their tag; unreleased themes show a short commit.
fn catalog_version(tag: &str) -> String {
    if tag.len() == 40
        && tag
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        tag[..7].to_owned()
    } else {
        tag.to_owned()
    }
}

/// Catalog entries enriched with their installed state, followed by local
/// and unlisted plugins.
pub fn merge_plugins(
    installed: &InstalledPlugins,
    catalog: Option<&PluginCatalog>,
) -> Vec<PluginListItem> {
    let entries = catalog
        .map(|catalog| catalog.plugins.as_slice())
        .unwrap_or_default();
    let listed = entries.iter().map(|entry| {
        match installed
            .plugins
            .iter()
            .find(|plugin| plugin.id == entry.id)
        {
            None => PluginListItem {
                id: entry.id.clone(),
                name: entry.name.clone(),
                repo: Some(entry.repo.clone()),
                version: Some(catalog_version(&entry.tag)),
                description: Some(entry.description.clone()),
                preview_url: entry.preview_url.clone(),
                contributions: entry.contributions.clone(),
                stars: entry.stars,
                released_at: entry.released_at.clone(),
                listed: true,
                installed: None,
            },
            Some(plugin) => PluginListItem {
                id: plugin.id.clone(),
                name: plugin.name.clone(),
                repo: plugin.repo.clone(),
                version: plugin.version.clone(),
                description: Some(entry.description.clone()),
                preview_url: entry
                    .preview_url
                    .clone()
                    .or_else(|| plugin.preview_url.clone()),
                // The catalog lists contributions for every entry it has.
                contributions: entry.contributions.clone(),
                stars: entry.stars,
                released_at: entry.released_at.clone(),
                listed: true,
                installed: Some(plugin.clone()),
            },
        }
    });
    let unlisted = installed
        .plugins
        .iter()
        .filter(|plugin| !entries.iter().any(|entry| entry.id == plugin.id))
        .map(|plugin| PluginListItem {
            id: plugin.id.clone(),
            name: plugin.name.clone(),
            repo: plugin.repo.clone(),
            version: plugin.version.clone(),
            description: plugin.description.clone(),
            preview_url: plugin.preview_url.clone(),
            contributions: plugin.contributions.clone(),
            stars: 0,
            released_at: None,
            listed: false,
            installed: Some(plugin.clone()),
        });
    listed.chain(unlisted).collect()
}

/// The plugin a selection names, or a placeholder for a repo that isn't
/// listed or installed (a deep link to an unknown plugin).
pub fn resolve_selection(
    plugins: &[PluginListItem],
    selection: &PluginSelection,
) -> PluginListItem {
    let repo = selection.repo.as_deref().map(str::to_lowercase);
    let found = plugins.iter().find(|plugin| match &selection.id {
        Some(id) => &plugin.id == id,
        None => plugin.repo.as_deref().map(str::to_lowercase) == repo,
    });
    if let Some(plugin) = found {
        return plugin.clone();
    }
    let name = selection
        .repo
        .as_deref()
        .and_then(|repo| repo.rsplit('/').next())
        .or(selection.id.as_deref())
        .unwrap_or_default()
        .to_owned();
    PluginListItem {
        id: selection.id.clone().unwrap_or_else(|| name.clone()),
        name,
        repo: selection.repo.clone(),
        version: None,
        description: None,
        preview_url: None,
        contributions: Vec::new(),
        stars: 0,
        released_at: None,
        listed: false,
        installed: None,
    }
}

/// Unlisted plugins have no stars or release date, so they sort last; ties
/// go by name, case-insensitively.
fn compare(left: &PluginListItem, right: &PluginListItem, sort: PluginSort) -> Ordering {
    let by_key = match sort {
        PluginSort::Stars => right.stars.cmp(&left.stars),
        PluginSort::Latest => right
            .released_at
            .as_deref()
            .unwrap_or("")
            .cmp(left.released_at.as_deref().unwrap_or("")),
    };
    by_key.then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
}

/// The grid: filtered by the search and "Installed only", sorted.
pub fn visible_plugins(
    plugins: &[PluginListItem],
    search: &str,
    installed_only: bool,
    sort: PluginSort,
) -> Vec<PluginListItem> {
    let query = search.trim().to_lowercase();
    let mut visible: Vec<PluginListItem> = plugins
        .iter()
        .filter(|plugin| (!installed_only || plugin.installed.is_some()) && plugin.matches(&query))
        .cloned()
        .collect();
    visible.sort_by(|left, right| compare(left, right, sort));
    visible
}

/// "3 plugins", "1 of 3 plugins".
pub fn plugin_count(visible: usize, total: usize) -> String {
    let noun = if total == 1 { "plugin" } else { "plugins" };
    if visible == total {
        format!("{total} {noun}")
    } else {
        format!("{visible} of {total} {noun}")
    }
}

#[cfg(test)]
mod tests {
    use rencal_core::plugins::PluginCatalogEntry;

    use super::*;

    fn entry(id: &str, name: &str, repo: &str, description: &str) -> PluginCatalogEntry {
        PluginCatalogEntry {
            id: id.into(),
            name: name.into(),
            repo: repo.into(),
            description: description.into(),
            tag: "v1.10.0".into(),
            contributions: vec![ContributionKind::Theme],
            preview_url: None,
            stars: 0,
            released_at: None,
        }
    }

    fn installed(id: &str, name: &str) -> InstalledPlugin {
        InstalledPlugin {
            id: id.into(),
            name: name.into(),
            description: None,
            contributions: Vec::new(),
            preview_url: None,
            repo: Some("alice/dusk".into()),
            local_dir: None,
            version: Some("v1.2.0".into()),
            update_version: Some("v1.10.0".into()),
            error: None,
        }
    }

    fn catalog(plugins: Vec<PluginCatalogEntry>) -> PluginCatalog {
        PluginCatalog {
            plugins,
            error: None,
        }
    }

    #[test]
    fn describes_an_unlisted_plugin_from_its_manifest() {
        let local = InstalledPlugin {
            repo: None,
            local_dir: Some("/home/alice/dusk".into()),
            update_version: None,
            description: Some("A local theme".into()),
            contributions: vec![ContributionKind::Theme],
            preview_url: Some("data:image/png;base64,AA==".into()),
            ..installed("alice.dusk", "Dusk")
        };
        let list = InstalledPlugins {
            plugins: vec![local],
            errors: Vec::new(),
        };
        let merged = merge_plugins(&list, Some(&catalog(Vec::new())));
        assert_eq!(merged.len(), 1);
        assert!(!merged[0].listed);
        assert_eq!(merged[0].description.as_deref(), Some("A local theme"));
        assert_eq!(merged[0].owner(), "alice");
        assert_eq!(
            merged[0].preview_url.as_deref(),
            Some("data:image/png;base64,AA==")
        );
    }

    #[test]
    fn enriches_catalog_entries_with_their_installed_state() {
        let list = InstalledPlugins {
            plugins: vec![installed("alice.dusk", "Dusk")],
            errors: Vec::new(),
        };
        let merged = merge_plugins(
            &list,
            Some(&catalog(vec![entry(
                "alice.dusk",
                "Dusk",
                "alice/dusk",
                "A quiet theme",
            )])),
        );
        assert_eq!(merged.len(), 1);
        assert!(merged[0].listed);
        assert_eq!(merged[0].version.as_deref(), Some("v1.2.0"));
        assert_eq!(merged[0].description.as_deref(), Some("A quiet theme"));
        assert_eq!(
            merged[0]
                .installed
                .as_ref()
                .unwrap()
                .update_version
                .as_deref(),
            Some("v1.10.0")
        );
    }

    #[test]
    fn sorts_and_filters_the_grid() {
        let mut dusk = entry("alice.dusk", "Dusk", "alice/dusk", "A quiet theme");
        dusk.stars = 3;
        dusk.released_at = Some("2026-09-01T00:00:00Z".into());
        let mut dawn = entry("bob.dawn", "Dawn", "bob/dawn", "A bright theme");
        dawn.stars = 12;
        dawn.released_at = Some("2026-08-01T00:00:00Z".into());
        let mut tuta = entry(
            "alice.tuta",
            "Tuta",
            "alice/caldir-provider-tuta",
            "Sync Tuta",
        );
        tuta.contributions = vec![ContributionKind::Provider];
        let list = InstalledPlugins {
            plugins: Vec::new(),
            errors: Vec::new(),
        };
        let merged = merge_plugins(&list, Some(&catalog(vec![dusk, dawn, tuta])));
        let names =
            |plugins: Vec<PluginListItem>| plugins.into_iter().map(|p| p.name).collect::<Vec<_>>();
        assert_eq!(
            names(visible_plugins(&merged, "", false, PluginSort::Stars)),
            ["Dawn", "Dusk", "Tuta"]
        );
        assert_eq!(
            names(visible_plugins(&merged, "", false, PluginSort::Latest)),
            ["Dusk", "Dawn", "Tuta"]
        );
        assert_eq!(
            names(visible_plugins(&merged, "bright", false, PluginSort::Stars)),
            ["Dawn"]
        );
        assert_eq!(
            names(visible_plugins(
                &merged,
                "provider",
                false,
                PluginSort::Stars
            )),
            ["Tuta"]
        );
        assert!(visible_plugins(&merged, "", true, PluginSort::Stars).is_empty());
        assert_eq!(plugin_count(1, 3), "1 of 3 plugins");
        assert_eq!(plugin_count(1, 1), "1 plugin");
    }

    #[test]
    fn resolves_deep_link_selections_by_repo() {
        let list = InstalledPlugins {
            plugins: Vec::new(),
            errors: Vec::new(),
        };
        let merged = merge_plugins(
            &list,
            Some(&catalog(vec![entry(
                "alice.dusk",
                "Dusk",
                "alice/dusk",
                "A quiet theme",
            )])),
        );
        let selection = PluginSelection {
            id: None,
            repo: Some("Alice/Dusk".into()),
        };
        assert_eq!(resolve_selection(&merged, &selection).id, "alice.dusk");
        let unknown = PluginSelection {
            id: None,
            repo: Some("carol/night".into()),
        };
        let placeholder = resolve_selection(&merged, &unknown);
        assert_eq!(placeholder.name, "night");
        assert_eq!(placeholder.id, "night");
        assert!(!placeholder.listed);
    }

    #[test]
    fn unreleased_entries_show_a_short_commit() {
        assert_eq!(catalog_version(&"a".repeat(40)), "aaaaaaa");
        assert_eq!(catalog_version("v1.0.0"), "v1.0.0");
    }
}
