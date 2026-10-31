import type { ComponentType } from "react"

import type { Binding } from "@/lib/key-bindings"

import { MonthView } from "@/views/builtin/month/MonthView"
import { WeekView } from "@/views/builtin/week/WeekView"
import { YearView } from "@/views/builtin/year/YearView"

export type ViewDescriptor = {
  id: string
  name: string
  component: ComponentType
  // Default key that shows this view; keys.toml can rebind it.
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

// Each view's shortcut switches to it; they lead the default bindings.
export function viewBindings(views: readonly ViewDescriptor[]): Binding[] {
  return views.flatMap(({ id, shortcut }) =>
    shortcut ? [{ keys: shortcut, action: `view.switch:${id}` }] : [],
  )
}
