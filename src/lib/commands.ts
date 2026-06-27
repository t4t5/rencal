// Command palette entries. Each maps 1:1 to an existing shortcut id so the palette
// reuses the shortcut action handlers and key hints as its single source of truth.
import { ShortcutId } from "@/lib/shortcuts"

export const COMMAND_GROUPS = ["Calendar", "View", "Navigation", "General"] as const
export type CommandGroup = (typeof COMMAND_GROUPS)[number]

export interface PaletteCommand {
  id: ShortcutId
  group: CommandGroup
  // Optional override of the shortcut's label for palette display.
  label?: string
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
  { id: "toggle-theme", group: "General" },
  { id: "settings", group: "General" },
  { id: "shortcuts", group: "General" },
]
