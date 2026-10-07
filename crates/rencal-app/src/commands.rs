//! Command palette entries (port of `src/lib/palette-commands.ts`): which
//! shortcuts the palette lists, in which group, and the ones that drill into a
//! sub-page instead of running.

use crate::keymap::{self, ToggleWeekNumbers};
use gpui_kit::Action;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CommandGroup {
    Calendar,
    View,
    Navigation,
    General,
}

impl CommandGroup {
    pub const ALL: [CommandGroup; 4] =
        [Self::Calendar, Self::View, Self::Navigation, Self::General];

    pub fn label(self) -> &'static str {
        match self {
            Self::Calendar => "Calendar",
            Self::View => "View",
            Self::Navigation => "Navigation",
            Self::General => "General",
        }
    }
}

/// A static, filterable list the palette drills into.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Submenu {
    Themes,
    CalendarGroups,
}

/// A special page with its own dynamic content.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Page {
    GoToDate,
}

pub struct PaletteCommand {
    /// A shortcut id, or `toggle-week-numbers`.
    pub id: &'static str,
    pub group: CommandGroup,
    /// Overrides the shortcut's label.
    pub label: Option<&'static str>,
    pub submenu: Option<Submenu>,
    pub page: Option<Page>,
}

impl PaletteCommand {
    pub fn label(&self) -> &'static str {
        self.label
            .or_else(|| keymap::shortcut(self.id).map(|s| s.label))
            .unwrap_or(self.id)
    }

    /// The action the command runs (none for drill-in entries).
    pub fn action(&self) -> Option<Box<dyn Action>> {
        if self.submenu.is_some() || self.page.is_some() {
            return None;
        }
        match self.id {
            "toggle-week-numbers" => Some(Box::new(ToggleWeekNumbers)),
            id => keymap::shortcut(id).map(|shortcut| (shortcut.action)()),
        }
    }
}

const fn command(id: &'static str, group: CommandGroup) -> PaletteCommand {
    PaletteCommand {
        id,
        group,
        label: None,
        submenu: None,
        page: None,
    }
}

const fn labelled(id: &'static str, group: CommandGroup, label: &'static str) -> PaletteCommand {
    PaletteCommand {
        label: Some(label),
        ..command(id, group)
    }
}

pub static PALETTE_COMMANDS: &[PaletteCommand] = &[
    command("add-event", CommandGroup::Calendar),
    command("duplicate-event", CommandGroup::Calendar),
    labelled("search", CommandGroup::Calendar, "Search events…"),
    command("month", CommandGroup::View),
    command("week", CommandGroup::View),
    command("board", CommandGroup::View),
    labelled(
        "toggle-week-numbers",
        CommandGroup::View,
        "Toggle week numbers",
    ),
    PaletteCommand {
        submenu: Some(Submenu::CalendarGroups),
        ..labelled("switch-group", CommandGroup::View, "Switch calendar group…")
    },
    PaletteCommand {
        page: Some(Page::GoToDate),
        ..labelled("go-to-date", CommandGroup::Navigation, "Go to date…")
    },
    command("today", CommandGroup::Navigation),
    PaletteCommand {
        submenu: Some(Submenu::Themes),
        ..labelled("toggle-theme", CommandGroup::General, "Set theme…")
    },
    command("settings", CommandGroup::General),
    command("shortcuts", CommandGroup::General),
];

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::*;

    #[test]
    fn matches_the_ts_palette_table() {
        let path = format!(
            "{}/tests/fixtures/palette_commands.json",
            env!("CARGO_MANIFEST_DIR")
        );
        let fixture: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        let cases = fixture["cases"].as_array().unwrap();
        let groups: Vec<&str> = CommandGroup::ALL.iter().map(|g| g.label()).collect();
        assert_eq!(cases[0]["output"], json!(groups));

        let commands = &cases[1..];
        assert_eq!(commands.len(), PALETTE_COMMANDS.len());
        for (case, command) in commands.iter().zip(PALETTE_COMMANDS) {
            let actual = json!({
                "group": command.group.label(),
                "id": command.id,
                "label": command.label,
                "page": command.page.map(|_| "go-to-date"),
                "submenu": command.submenu.map(|s| match s {
                    Submenu::Themes => "themes",
                    Submenu::CalendarGroups => "calendar-groups",
                }),
            });
            assert_eq!(case["output"], actual, "command {}", case["name"]);
        }
    }

    #[test]
    fn every_runnable_command_has_an_action() {
        for command in PALETTE_COMMANDS {
            let drills = command.submenu.is_some() || command.page.is_some();
            assert_eq!(command.action().is_none(), drills, "{}", command.id);
        }
    }
}
