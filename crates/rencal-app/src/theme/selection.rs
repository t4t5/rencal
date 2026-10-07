//! Which theme shows (GPUI_PORT_PLAN.md §4.7). A port of the old
//! `src/themes/theme-settings.ts`; the settings are `[theme]` in renCal's
//! `config.toml` (`rencal_config::ThemeConfig`).

use rencal_config::{ThemeConfig, ThemeMode};
use rencal_theme::{Appearance, OMARCHY_THEME_ID};

/// A theme the picker can offer.
#[derive(Clone, Debug, PartialEq)]
pub struct ThemeDescriptor {
    pub id: String,
    pub name: String,
    pub appearance: Appearance,
}

/// A settings field holding a theme id.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ThemeSlot {
    // Picked by Settings → Themes (Phase 5).
    #[allow(dead_code)]
    Single,
    Light,
    Dark,
}

impl From<Appearance> for ThemeSlot {
    fn from(appearance: Appearance) -> Self {
        match appearance {
            Appearance::Light => Self::Light,
            Appearance::Dark => Self::Dark,
        }
    }
}

pub fn slot(settings: &ThemeConfig, slot: ThemeSlot) -> &str {
    match slot {
        ThemeSlot::Single => &settings.single,
        ThemeSlot::Light => &settings.light,
        ThemeSlot::Dark => &settings.dark,
    }
}

pub fn is_omarchy(id: &str) -> bool {
    id == OMARCHY_THEME_ID
}

/// The theme shown whatever the OS appearance; `None` while following the OS.
/// On Omarchy, syncing shows Omarchy.
pub fn forced_theme(settings: &ThemeConfig, on_omarchy: bool) -> Option<&str> {
    match settings.mode {
        ThemeMode::Single => Some(&settings.single),
        ThemeMode::System if on_omarchy => Some(OMARCHY_THEME_ID),
        ThemeMode::System => None,
    }
}

/// The id of the theme to show.
pub fn active_theme(settings: &ThemeConfig, on_omarchy: bool, os: Appearance) -> &str {
    forced_theme(settings, on_omarchy).unwrap_or_else(|| slot(settings, os.into()))
}

/// Themes offered for a slot. Omarchy is shown by syncing, so no slot offers it.
pub fn themes_for(slot: ThemeSlot, descriptors: &[ThemeDescriptor]) -> Vec<&ThemeDescriptor> {
    descriptors
        .iter()
        .filter(|theme| {
            !is_omarchy(&theme.id)
                && match slot {
                    ThemeSlot::Single => true,
                    ThemeSlot::Light => theme.appearance == Appearance::Light,
                    ThemeSlot::Dark => theme.appearance == Appearance::Dark,
                }
        })
        .collect()
}

pub fn with_slot(settings: &ThemeConfig, slot: ThemeSlot, id: &str) -> ThemeConfig {
    let mut next = settings.clone();
    *match slot {
        ThemeSlot::Single => &mut next.single,
        ThemeSlot::Light => &mut next.light,
        ThemeSlot::Dark => &mut next.dark,
    } = id.to_owned();
    next
}

/// Shows `id` as the single theme; Omarchy is shown by syncing instead.
pub fn pick_theme(settings: &ThemeConfig, id: &str) -> ThemeConfig {
    if is_omarchy(id) {
        ThemeConfig {
            mode: ThemeMode::System,
            ..settings.clone()
        }
    } else {
        ThemeConfig {
            mode: ThemeMode::Single,
            single: id.to_owned(),
            ..settings.clone()
        }
    }
}

/// The showing theme's next one, in display order: within the OS's slot while
/// following it, otherwise among every theme (on Omarchy, Omarchy too).
pub fn cycle_theme(
    settings: &ThemeConfig,
    descriptors: &[ThemeDescriptor],
    on_omarchy: bool,
    os: Appearance,
) -> ThemeConfig {
    let forced = forced_theme(settings, on_omarchy);
    let themes: Vec<&ThemeDescriptor> = match forced {
        Some(_) => descriptors.iter().collect(),
        None => themes_for(os.into(), descriptors),
    };
    let current = forced.unwrap_or_else(|| slot(settings, os.into()));
    // An unlisted theme starts the list over.
    let next = themes
        .iter()
        .position(|theme| theme.id == current)
        .map_or(0, |index| (index + 1) % themes.len());
    let Some(next) = themes.get(next) else {
        return settings.clone();
    };
    match forced {
        None => with_slot(settings, os.into(), &next.id),
        Some(_) => pick_theme(settings, &next.id),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn builtins() -> Vec<ThemeDescriptor> {
        rencal_theme::builtin_themes()
            .iter()
            .filter(|theme| theme.listed)
            .map(|theme| ThemeDescriptor {
                id: theme.id.clone(),
                name: theme.theme.name.clone(),
                appearance: theme.theme.appearance,
            })
            .collect()
    }

    /// The registry on an Omarchy desktop.
    fn with_omarchy() -> Vec<ThemeDescriptor> {
        let mut descriptors = vec![ThemeDescriptor {
            id: OMARCHY_THEME_ID.into(),
            name: "Omarchy (Auto)".into(),
            appearance: Appearance::Light,
        }];
        descriptors.extend(builtins());
        descriptors
    }

    fn settings() -> ThemeConfig {
        ThemeConfig {
            mode: ThemeMode::System,
            single: "nord".into(),
            light: "ren-light".into(),
            dark: "ren".into(),
        }
    }

    fn single(settings: &ThemeConfig) -> ThemeConfig {
        ThemeConfig {
            mode: ThemeMode::Single,
            ..settings.clone()
        }
    }

    fn ids(slot: ThemeSlot) -> Vec<String> {
        themes_for(slot, &builtins())
            .into_iter()
            .map(|theme| theme.id.clone())
            .collect()
    }

    #[test]
    fn follows_the_os_while_syncing_except_on_omarchy_and_forces_the_single_theme() {
        let settings = settings();
        assert_eq!(forced_theme(&settings, false), None);
        assert_eq!(forced_theme(&settings, true), Some("omarchy"));
        assert_eq!(forced_theme(&single(&settings), false), Some("nord"));
        assert_eq!(forced_theme(&single(&settings), true), Some("nord"));
        assert_eq!(
            active_theme(&settings, false, Appearance::Light),
            "ren-light"
        );
        assert_eq!(active_theme(&settings, false, Appearance::Dark), "ren");
    }

    #[test]
    fn offers_a_pair_slot_its_appearance_single_every_theme_and_no_slot_omarchy() {
        assert!(ids(ThemeSlot::Light).contains(&"ren-light".into()));
        assert!(!ids(ThemeSlot::Light).contains(&"ren".into()));
        assert!(ids(ThemeSlot::Dark).contains(&"ren".into()));
        assert!(!ids(ThemeSlot::Dark).contains(&"ren-light".into()));
        for slot in [ThemeSlot::Single, ThemeSlot::Light, ThemeSlot::Dark] {
            assert!(
                !themes_for(slot, &with_omarchy())
                    .iter()
                    .any(|theme| is_omarchy(&theme.id))
            );
        }
        let all: Vec<String> = builtins().into_iter().map(|theme| theme.id).collect();
        assert_eq!(ids(ThemeSlot::Single), all);
    }

    #[test]
    fn picks_a_theme_as_the_single_theme_and_omarchy_by_syncing() {
        let settings = settings();
        assert_eq!(
            pick_theme(&settings, "minimal"),
            ThemeConfig {
                mode: ThemeMode::Single,
                single: "minimal".into(),
                ..settings.clone()
            }
        );
        assert_eq!(pick_theme(&single(&settings), "omarchy"), settings);
    }

    #[test]
    fn cycles_the_showing_pair_slot_and_leaves_the_rest_alone() {
        let light = ids(ThemeSlot::Light);
        let mut next = settings();
        let mut seen = Vec::new();
        for _ in 0..light.len() {
            next = cycle_theme(&next, &builtins(), false, Appearance::Light);
            seen.push(next.light.clone());
            assert_eq!(next.mode, ThemeMode::System);
            assert_eq!(next.single, "nord");
            assert_eq!(next.dark, "ren");
        }
        seen.sort();
        let mut light = light;
        light.sort();
        assert_eq!(seen, light);
    }

    #[test]
    fn cycles_every_theme_in_single_mode() {
        let all = ids(ThemeSlot::Single);
        let index = all.iter().position(|id| id == "nord").unwrap();
        assert_eq!(
            cycle_theme(&single(&settings()), &builtins(), false, Appearance::Dark).single,
            all[(index + 1) % all.len()]
        );
    }

    #[test]
    fn cycles_from_omarchy_to_a_single_theme_and_back_to_syncing() {
        let settings = settings();
        assert_eq!(
            cycle_theme(&settings, &with_omarchy(), true, Appearance::Dark),
            ThemeConfig {
                mode: ThemeMode::Single,
                single: "ren".into(),
                ..settings.clone()
            }
        );
        let last = ThemeConfig {
            mode: ThemeMode::Single,
            single: "minimal".into(),
            ..settings.clone()
        };
        assert_eq!(
            cycle_theme(&last, &with_omarchy(), true, Appearance::Dark),
            ThemeConfig {
                mode: ThemeMode::System,
                ..last.clone()
            }
        );
    }

    #[test]
    fn starts_the_slots_list_over_from_an_unlisted_theme() {
        let gone = ThemeConfig {
            dark: "user:gone".into(),
            ..settings()
        };
        assert_eq!(
            cycle_theme(&gone, &builtins(), false, Appearance::Dark).dark,
            ids(ThemeSlot::Dark)[0]
        );
    }
}
