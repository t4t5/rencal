import { useContext, useMemo } from "react"

import { SHORTCUTS, type ShortcutDef } from "@/lib/shortcuts"

import { ViewRegistryContext } from "@/views/ViewRegistry"
import { viewShortcuts, type ViewDescriptor } from "@/views/manifest"

// Built-in views, then the views installed plugins contribute.
export const useViews = (): readonly ViewDescriptor[] => useContext(ViewRegistryContext)

// View shortcuts come first so they lead the View group.
export function useShortcutDefs(): readonly ShortcutDef[] {
  const views = useViews()
  return useMemo(() => [...viewShortcuts(views), ...SHORTCUTS], [views])
}
