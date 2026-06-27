// Command palette entries. Each maps 1:1 to an existing shortcut id so the palette
// reuses the shortcut action handlers and key hints as its single source of truth.
import { ShortcutId } from "@/lib/shortcuts"

export const COMMAND_GROUPS = ["Calendar", "View", "Navigation", "General"] as const
export type CommandGroup = (typeof COMMAND_GROUPS)[number]

// Sub-pages the palette can drill into. Selecting a command with a `submenu`
// opens a second screen (e.g. a theme picker) instead of running its shortcut.
export type PaletteSubmenu = "theme"

export interface PaletteCommand {
  id: ShortcutId
  group: CommandGroup
  // Optional override of the shortcut's label for palette display.
  label?: string
  // When set, selecting this command opens a sub-page instead of running the shortcut.
  submenu?: PaletteSubmenu
}

export const PALETTE_COMMANDS: readonly PaletteCommand[] = [
  { id: "compose-event", group: "Calendar", label: "Create event" },
  { id: "add-event", group: "Calendar" },
  { id: "month", group: "View" },
  { id: "week", group: "View" },
  { id: "board", group: "View" },
  { id: "switch-group", group: "View" },
  { id: "today", group: "Navigation" },
  { id: "search", group: "General" },
  { id: "toggle-theme", group: "General", label: "Set theme…", submenu: "theme" },
  { id: "settings", group: "General" },
  { id: "shortcuts", group: "General" },
]
