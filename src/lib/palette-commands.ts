import { ShortcutId } from "@/lib/shortcuts"

export const COMMAND_GROUPS = ["Calendar", "View", "Navigation", "General"] as const
export type CommandGroup = (typeof COMMAND_GROUPS)[number]

export type PaletteSubmenu = "themes" | "calendar-groups"

export interface PaletteCommand {
  id: ShortcutId
  group: CommandGroup
  // Override of the shortcut's label in the palette:
  label?: string
  // Opens a sub-page instead of running the shortcut:
  submenu?: PaletteSubmenu
}

// Drives a sub-page: a searchable list of options with the active one checked.
// Built at render time from live app state (themes, groups, …).
export interface SubmenuConfig {
  heading: string
  placeholder: string
  empty: string
  items: readonly { id: string; label: string }[]
  activeId: string
  onSelect: (id: string) => void
}

export const PALETTE_COMMANDS: readonly PaletteCommand[] = [
  { id: "add-event", group: "Calendar" },
  { id: "month", group: "View" },
  { id: "week", group: "View" },
  { id: "board", group: "View" },
  { id: "switch-group", group: "View", label: "Switch group…", submenu: "calendar-groups" },
  { id: "today", group: "Navigation" },
  { id: "toggle-theme", group: "General", label: "Set theme…", submenu: "themes" },
  { id: "settings", group: "General" },
  { id: "shortcuts", group: "General" },
]
