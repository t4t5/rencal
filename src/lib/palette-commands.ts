import { ShortcutId } from "@/lib/shortcuts"

export const COMMAND_GROUPS = ["Calendar", "View", "Navigation", "General"] as const
export type CommandGroup = (typeof COMMAND_GROUPS)[number]

export type PaletteSubmenu = "themes" | "calendar-groups"

// Special sub-pages that drive their own dynamic content (no static SubmenuConfig).
export type PalettePage = "go-to-date"

export interface PaletteCommand {
  id: ShortcutId
  group: CommandGroup
  // Override of the shortcut's label in the palette:
  label?: string
  // Drills into a static, filterable list:
  submenu?: PaletteSubmenu
  // Drills into a special dynamic page (no SubmenuConfig):
  page?: PalettePage
}

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
  { id: "go-to-date", group: "Navigation", label: "Go to date…", page: "go-to-date" },
  { id: "toggle-theme", group: "General", label: "Set theme…", submenu: "themes" },
  { id: "settings", group: "General" },
  { id: "shortcuts", group: "General" },
]
