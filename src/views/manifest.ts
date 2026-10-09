import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { ComponentType } from "react"

import { MonthView } from "@/components/main/month-view/MonthView"
import { WeekView } from "@/components/main/week-view/WeekView"

import { SHORTCUTS, type ShortcutDef } from "@/lib/shortcuts"

import { YearView } from "@/plugins/year/YearView"

export type ViewDescriptor = {
  id: string
  name: string
  component: ComponentType
  // Single character that shows this view. Also shown in the view dropdown.
  shortcut?: string
}

export const DEFAULT_VIEW_ID = "month"

// Array order is display order (dropdown, palette, shortcuts overlay).
export const BUILTIN_VIEWS: ViewDescriptor[] = [
  { id: "week", name: "Week", component: WeekView, shortcut: "w" },
  { id: "month", name: "Month", component: MonthView, shortcut: "m" },
  { id: "year", name: "Year", component: YearView, shortcut: "y" },
]

// Unknown ids (a removed view, a plugin view not loaded yet) fall back to the default.
export function resolveView(id: string, views: readonly ViewDescriptor[]): ViewDescriptor {
  const view =
    views.find((v) => v.id === id) ?? views.find((v) => v.id === DEFAULT_VIEW_ID) ?? views[0]
  if (!view) throw new Error("No views registered")
  return view
}

// Built-in views get their own message; a plugin's view uses its own name in the template.
const BUILTIN_VIEW_SHORTCUT_LABELS: Record<string, MessageDescriptor> = {
  week: msg`Display week view`,
  month: msg`Display month view`,
  year: msg`Display year view`,
}

export function viewShortcuts(views: readonly ViewDescriptor[]): ShortcutDef[] {
  return views.flatMap(({ id, name, shortcut }) =>
    shortcut
      ? [
          {
            id,
            group: "view",
            label: BUILTIN_VIEW_SHORTCUT_LABELS[id] ?? viewShortcutLabel(name),
            bindings: [{ keys: shortcut, type: "char" }],
          },
        ]
      : [],
  )
}

function viewShortcutLabel(name: string): MessageDescriptor {
  const view = name.toLowerCase()
  return msg`Display ${view} view`
}
