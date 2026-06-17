// Single source of truth for keyboard shortcuts.

export interface ShortcutBinding {
  keys: string
  type: "char" | "hotkey"
  allowShift?: boolean
  hidden?: boolean
}

export interface ShortcutDef {
  id: string
  group: ShortcutGroup
  label: string
  bindings: readonly ShortcutBinding[]
}

export const SHORTCUT_GROUPS = ["Navigation", "View", "General"] as const
export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number]

export const SHORTCUTS = [
  {
    id: "today",
    group: "Navigation",
    label: "Go to today",
    bindings: [{ keys: "t", type: "char" }],
  },
  {
    id: "next-day",
    group: "Navigation",
    label: "Next day",
    bindings: [
      { keys: "right", type: "hotkey" },
      { keys: "l", type: "char" },
    ],
  },
  {
    id: "prev-day",
    group: "Navigation",
    label: "Previous day",
    bindings: [
      { keys: "left", type: "hotkey" },
      { keys: "h", type: "char" },
    ],
  },
  {
    id: "next-week",
    group: "Navigation",
    label: "Next week",
    bindings: [
      { keys: "down", type: "hotkey" },
      { keys: "j", type: "char" },
    ],
  },
  {
    id: "prev-week",
    group: "Navigation",
    label: "Previous week",
    bindings: [
      { keys: "up", type: "hotkey" },
      { keys: "k", type: "char" },
    ],
  },
  {
    id: "next-event",
    group: "Navigation",
    label: "Next event",
    bindings: [{ keys: "tab", type: "hotkey" }],
  },
  {
    id: "prev-event",
    group: "Navigation",
    label: "Previous event",
    bindings: [{ keys: "shift+tab", type: "hotkey" }],
  },
  {
    id: "month",
    group: "View",
    label: "Month view",
    bindings: [{ keys: "m", type: "char" }],
  },
  {
    id: "board",
    group: "View",
    label: "Board view",
    bindings: [{ keys: "b", type: "char" }],
  },
  {
    id: "week",
    group: "View",
    label: "Week view",
    bindings: [{ keys: "w", type: "char" }],
  },
  {
    id: "search",
    group: "General",
    label: "Search",
    bindings: [
      { keys: "mod+f", type: "hotkey" },
      { keys: "mod+p", type: "hotkey", hidden: true },
      { keys: "/", type: "char", allowShift: true },
    ],
  },
  {
    id: "compose-event",
    group: "General",
    label: "Compose new event",
    bindings: [{ keys: "c", type: "char" }],
  },
  {
    id: "add-event",
    group: "General",
    label: "Add event to selected day",
    bindings: [{ keys: "a", type: "char" }],
  },
  {
    id: "settings",
    group: "General",
    label: "Settings",
    bindings: [{ keys: "mod+comma", type: "hotkey" }],
  },
  {
    id: "toggle-theme",
    group: "General",
    label: "Toggle theme",
    bindings: [{ keys: "mod+shift+t", type: "hotkey" }],
  },
  {
    id: "shortcuts",
    group: "General",
    label: "Keyboard shortcuts",
    bindings: [{ keys: "?", type: "char", allowShift: true }],
  },
] as const satisfies readonly ShortcutDef[]

export type ShortcutId = (typeof SHORTCUTS)[number]["id"]
