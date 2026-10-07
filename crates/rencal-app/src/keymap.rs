//! The keyboard shortcut table (GPUI_PORT_PLAN.md §3.5, port of
//! `src/lib/shortcuts.ts`): one static table feeding the key bindings, the
//! shortcuts overlay, the command palette and tooltips. Keep
//! `website/src/content/docs/docs/keyboard-shortcuts.md` in sync.
//!
//! Keys use the old react-hotkeys-hook spelling (`mod+shift+t`, `/`) so the
//! table stays comparable with the TS fixtures; `keystroke` turns them into
//! GPUI's (`secondary-shift-t`). `mod` is cmd on macOS, ctrl elsewhere.

use gpui_kit::{Action, actions};

actions!(
    rencal,
    [
        NextDay,
        PrevDay,
        NextWeek,
        PrevWeek,
        NextMonth,
        PrevMonth,
        NextEvent,
        PrevEvent,
        GoToToday,
        GoToDate,
        ShowMonthView,
        ShowBoardView,
        ShowWeekView,
        SwitchGroup,
        ToggleSidebar,
        Search,
        ComposeEvent,
        AddEvent,
        DuplicateEvent,
        ToggleInvites,
        SyncNow,
        OpenSettings,
        ToggleTheme,
        ShowShortcuts,
        ToggleCommandPalette,
        /// Palette only: no key binding.
        ToggleWeekNumbers,
    ]
);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BindingKind {
    /// A single printable key; bound in the calendar view's key context only,
    /// so text inputs never trigger it.
    Char,
    /// A named key or modifier combination.
    Hotkey,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Binding {
    pub keys: &'static str,
    pub kind: BindingKind,
    /// The key may need shift on some layouts (`/`, `?`).
    pub allow_shift: bool,
    /// Bound, but not shown in the overlay, palette or tooltips.
    pub hidden: bool,
    /// Also fires while a text input has focus.
    pub enable_on_form_tags: bool,
}

const fn char(keys: &'static str) -> Binding {
    Binding {
        keys,
        kind: BindingKind::Char,
        allow_shift: false,
        hidden: false,
        enable_on_form_tags: false,
    }
}

const fn hotkey(keys: &'static str) -> Binding {
    Binding {
        keys,
        kind: BindingKind::Hotkey,
        allow_shift: false,
        hidden: false,
        enable_on_form_tags: false,
    }
}

const fn shifted(binding: Binding) -> Binding {
    Binding {
        allow_shift: true,
        ..binding
    }
}

const fn hidden(binding: Binding) -> Binding {
    Binding {
        hidden: true,
        ..binding
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShortcutGroup {
    Navigation,
    View,
    General,
}

impl ShortcutGroup {
    pub const ALL: [ShortcutGroup; 3] = [Self::Navigation, Self::View, Self::General];

    pub fn label(self) -> &'static str {
        match self {
            Self::Navigation => "Navigation",
            Self::View => "View",
            Self::General => "General",
        }
    }
}

pub struct Shortcut {
    pub id: &'static str,
    pub group: ShortcutGroup,
    pub label: &'static str,
    pub bindings: &'static [Binding],
    /// An open event locks the view behind it; only shortcuts that leave it
    /// alone opt out.
    #[cfg_attr(
        not(test),
        expect(dead_code, reason = "enforced once events open in a popover (Phase 4)")
    )]
    pub allow_while_event_open: bool,
    pub action: fn() -> Box<dyn Action>,
}

impl Shortcut {
    /// The first binding shown to the user.
    pub fn display_binding(&self) -> Option<&'static Binding> {
        self.bindings.iter().find(|binding| !binding.hidden)
    }
}

macro_rules! shortcut {
    ($id:literal, $group:ident, $label:literal, [$($binding:expr),* $(,)?], $action:expr $(, allow_while_event_open: $open:literal)?) => {
        Shortcut {
            id: $id,
            group: ShortcutGroup::$group,
            label: $label,
            bindings: &[$($binding),*],
            allow_while_event_open: false $(|| $open)?,
            action: || Box::new($action),
        }
    };
}

pub static SHORTCUTS: &[Shortcut] = &[
    shortcut!(
        "next-day",
        Navigation,
        "Next day",
        [hotkey("right"), char("l")],
        NextDay
    ),
    shortcut!(
        "prev-day",
        Navigation,
        "Previous day",
        [hotkey("left"), char("h")],
        PrevDay
    ),
    shortcut!(
        "next-week",
        Navigation,
        "Next week",
        [hotkey("down"), char("j")],
        NextWeek
    ),
    shortcut!(
        "prev-week",
        Navigation,
        "Previous week",
        [hotkey("up"), char("k")],
        PrevWeek
    ),
    shortcut!(
        "next-month",
        Navigation,
        "Next month",
        [hotkey("ctrl+d")],
        NextMonth
    ),
    shortcut!(
        "prev-month",
        Navigation,
        "Previous month",
        [hotkey("ctrl+u")],
        PrevMonth
    ),
    shortcut!(
        "next-event",
        Navigation,
        "Next event",
        [hotkey("tab")],
        NextEvent
    ),
    shortcut!(
        "prev-event",
        Navigation,
        "Previous event",
        [hotkey("shift+tab")],
        PrevEvent
    ),
    shortcut!("today", Navigation, "Go to today", [char("t")], GoToToday),
    shortcut!(
        "go-to-date",
        Navigation,
        "Go to date...",
        [char(".")],
        GoToDate
    ),
    shortcut!(
        "month",
        View,
        "Display month view",
        [char("m")],
        ShowMonthView
    ),
    shortcut!(
        "board",
        View,
        "Display board view",
        [char("b")],
        ShowBoardView
    ),
    shortcut!("week", View, "Display week view", [char("w")], ShowWeekView),
    shortcut!(
        "switch-group",
        View,
        "Switch calendar group",
        [char("g")],
        SwitchGroup
    ),
    shortcut!(
        "toggle-sidebar",
        View,
        "Toggle sidebar",
        [hotkey("ctrl+b")],
        ToggleSidebar
    ),
    shortcut!(
        "search",
        General,
        "Search",
        [
            hidden(hotkey("mod+f")),
            hidden(hotkey("mod+p")),
            shifted(char("/")),
        ],
        Search
    ),
    shortcut!(
        "compose-event",
        General,
        "Compose new event",
        [char("c")],
        ComposeEvent
    ),
    shortcut!(
        "add-event",
        General,
        "Add event to selected day",
        [char("a")],
        AddEvent
    ),
    shortcut!(
        "duplicate-event",
        General,
        "Duplicate selected event",
        [char("d")],
        DuplicateEvent,
        allow_while_event_open: true
    ),
    shortcut!(
        "toggle-invites",
        General,
        "Toggle invitations",
        [char("i")],
        ToggleInvites
    ),
    shortcut!(
        "sync",
        General,
        "Sync now",
        [char("s")],
        SyncNow,
        allow_while_event_open: true
    ),
    shortcut!(
        "settings",
        General,
        "Go to settings",
        [hotkey("mod+comma")],
        OpenSettings,
        allow_while_event_open: true
    ),
    shortcut!(
        "toggle-theme",
        General,
        "Toggle theme",
        [hotkey("mod+shift+t")],
        ToggleTheme,
        allow_while_event_open: true
    ),
    shortcut!(
        "shortcuts",
        General,
        "Show keyboard shortcuts",
        [shifted(char("?"))],
        ShowShortcuts,
        allow_while_event_open: true
    ),
    shortcut!(
        "command-palette",
        General,
        "Open command palette",
        [Binding {
            enable_on_form_tags: true,
            ..hotkey("mod+k")
        }],
        ToggleCommandPalette
    ),
];

pub fn shortcut(id: &str) -> Option<&'static Shortcut> {
    SHORTCUTS.iter().find(|shortcut| shortcut.id == id)
}

/// Whether a binding works outside the calendar view (in other windows and
/// text inputs): modifier shortcuts that don't move the calendar.
pub fn is_global(binding: &Binding, id: &str) -> bool {
    binding.enable_on_form_tags || matches!(id, "settings" | "toggle-theme" | "toggle-sidebar")
}

/// GPUI's spelling of a binding's keys: `mod+shift+t` → `secondary-shift-t`.
pub fn keystroke(keys: &str) -> String {
    keys.split('+')
        .map(|part| match part {
            "mod" => "secondary",
            "comma" => ",",
            "period" => ".",
            "slash" => "/",
            other => other,
        })
        .collect::<Vec<_>>()
        .join("-")
}

/// The label of one key in a binding (`mod` → ⌘ on macOS, Ctrl elsewhere),
/// as `formatHotkeyKey` printed it.
pub fn key_label(key: &str) -> String {
    let mac = cfg!(target_os = "macos");
    match key {
        "mod" if mac => "\u{2318}".into(),
        "mod" | "ctrl" if !mac => "Ctrl".into(),
        "ctrl" => "\u{2303}".into(),
        "shift" if mac => "\u{21E7}".into(),
        "shift" => "Shift".into(),
        "alt" if mac => "\u{2325}".into(),
        "alt" => "Alt".into(),
        "comma" => ",".into(),
        "period" => ".".into(),
        "slash" => "/".into(),
        "space" => "Space".into(),
        "enter" => "Enter".into(),
        "escape" => "Esc".into(),
        "backspace" => "Backspace".into(),
        "delete" => "Delete".into(),
        "tab" => "Tab".into(),
        "up" | "arrowup" => "\u{2191}".into(),
        "down" | "arrowdown" => "\u{2193}".into(),
        "left" | "arrowleft" => "\u{2190}".into(),
        "right" | "arrowright" => "\u{2192}".into(),
        other => other.to_uppercase(),
    }
}

/// Each key of `keys` as a label, for a row of key chips.
pub fn key_labels(keys: &str) -> Vec<String> {
    keys.split('+').map(key_label).collect()
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::*;

    fn fixture(name: &str) -> Value {
        let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
    }

    fn binding_json(binding: &Binding) -> Value {
        json!({
            "allowShift": binding.allow_shift,
            "enableOnFormTags": binding.enable_on_form_tags,
            "hidden": binding.hidden,
            "keys": binding.keys,
            "type": match binding.kind {
                BindingKind::Char => "char",
                BindingKind::Hotkey => "hotkey",
            },
        })
    }

    #[test]
    fn matches_the_ts_shortcut_table() {
        let fixture = fixture("shortcuts.json");
        let cases = fixture["cases"].as_array().unwrap();
        let groups: Vec<&str> = ShortcutGroup::ALL.iter().map(|g| g.label()).collect();
        assert_eq!(cases[0]["output"], json!(groups));

        let shortcuts = &cases[1..];
        assert_eq!(shortcuts.len(), SHORTCUTS.len());
        for (case, shortcut) in shortcuts.iter().zip(SHORTCUTS) {
            let actual = json!({
                "allowWhileEventOpen": shortcut.allow_while_event_open,
                "bindings": shortcut.bindings.iter().map(binding_json).collect::<Vec<_>>(),
                "group": shortcut.group.label(),
                "id": shortcut.id,
                "label": shortcut.label,
            });
            assert_eq!(case["output"], actual, "shortcut {}", case["name"]);
        }
    }

    #[test]
    fn every_binding_parses_as_a_gpui_keystroke() {
        for shortcut in SHORTCUTS {
            for binding in shortcut.bindings {
                let keys = keystroke(binding.keys);
                gpui_kit::Keystroke::parse(&keys)
                    .unwrap_or_else(|err| panic!("{}: {keys}: {err:?}", shortcut.id));
            }
        }
        assert_eq!(keystroke("mod+shift+t"), "secondary-shift-t");
        assert_eq!(keystroke("mod+comma"), "secondary-,");
        assert_eq!(keystroke("shift+tab"), "shift-tab");
    }
}
