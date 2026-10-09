import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"

import { ShortcutId } from "@/lib/shortcuts"

// Group ids are compared, not shown; COMMAND_GROUP_LABELS holds the display text.
export const COMMAND_GROUPS = ["calendar", "view", "navigation", "general"] as const
export type CommandGroup = (typeof COMMAND_GROUPS)[number]

export const COMMAND_GROUP_LABELS: Record<CommandGroup, MessageDescriptor> = {
  calendar: msg({ message: "Calendar", context: "command group" }),
  view: msg({ message: "View", context: "command group" }),
  navigation: msg({ message: "Navigation", context: "command group" }),
  general: msg({ message: "General", context: "command group" }),
}

export type PaletteSubmenu = "themes" | "calendar-groups"

// Special sub-pages that drive their own dynamic content (no static SubmenuConfig).
export type PalettePage = "go-to-date"

export type PaletteCommandId = ShortcutId | "toggle-week-numbers"

export interface PaletteCommand {
  id: PaletteCommandId
  group: CommandGroup
  // Override of the shortcut's label in the palette:
  label?: MessageDescriptor
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
  { id: "add-event", group: "calendar" },
  { id: "duplicate-event", group: "calendar" },
  { id: "search", group: "calendar", label: msg`Search events…` },
  { id: "month", group: "view" },
  { id: "week", group: "view" },
  { id: "board", group: "view" },
  { id: "toggle-week-numbers", group: "view", label: msg`Toggle week numbers` },
  {
    id: "switch-group",
    group: "view",
    label: msg`Switch calendar group…`,
    submenu: "calendar-groups",
  },
  { id: "go-to-date", group: "navigation", label: msg`Go to date…`, page: "go-to-date" },
  { id: "today", group: "navigation" },
  { id: "toggle-theme", group: "general", label: msg`Set theme…`, submenu: "themes" },
  { id: "settings", group: "general" },
  { id: "shortcuts", group: "general" },
]
