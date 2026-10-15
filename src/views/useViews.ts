import { useMemo } from "react"

import { SHORTCUTS, type ShortcutDef } from "@/lib/shortcuts"

import { BUILTIN_VIEWS, viewShortcuts, type ViewDescriptor } from "@/views/manifest"

// A hook so runtime-registered (plugin) views can later be subscribed to without touching callers.
export const useViews = (): readonly ViewDescriptor[] => BUILTIN_VIEWS

// View shortcuts come first so they lead the View group.
export function useShortcutDefs(): readonly ShortcutDef[] {
  const views = useViews()
  return useMemo(() => [...viewShortcuts(views), ...SHORTCUTS], [views])
}
