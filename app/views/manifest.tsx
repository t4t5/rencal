import { computed, type JSX } from "nsh"

import type { Binding } from "@/lib/key-bindings"

import { pluginViews } from "@/stores/plugin-views"
import { PluginView } from "@/views/PluginView"
import { MonthView } from "@/views/month/MonthView"
import { DayView, WeekView } from "@/views/week/WeekView"
import { YearView } from "@/views/year/YearView"

export type ViewDescriptor = {
  id: string
  name: string
  component: () => JSX.Element
  // Default key that shows this view; keys.toml can rebind it.
  shortcut?: string
}

/** The built-in views, in the order the switcher lists them. */
export const VIEWS: readonly ViewDescriptor[] = [
  { id: "day", name: "Day", component: DayView, shortcut: "d" },
  { id: "week", name: "Week", component: WeekView, shortcut: "w" },
  { id: "month", name: "Month", component: MonthView, shortcut: "m" },
  { id: "year", name: "Year", component: YearView, shortcut: "y" },
]

/** The built-in views, then installed plugins' (`<plugin-id>/<view-id>`) that this renCal runs. */
export const views = computed((): readonly ViewDescriptor[] => [
  ...VIEWS,
  ...pluginViews().flatMap((view) => {
    const bundle = view.bundle
    if (!bundle) return []
    return [
      { id: view.id, name: view.name, component: () => <PluginView view={{ ...view, bundle }} /> },
    ]
  }),
])

export const resolveView = (id: string) =>
  views().find((view) => view.id === id) ?? VIEWS.find((view) => view.id === "month")!

// Each view's shortcut switches to it; they lead the default bindings.
export function viewBindings(views: readonly ViewDescriptor[]): Binding[] {
  return views.flatMap(({ id, shortcut }) =>
    shortcut ? [{ keys: shortcut, action: `view.switch:${id}` }] : [],
  )
}
