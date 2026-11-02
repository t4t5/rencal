import { useSyncExternalStore } from "react"

// Only one context menu is open at a time, so one key covers every block.
let menuKey: string | null = null
const listeners = new Set<() => void>()

/** The event whose context menu is open, or null. */
export function setMenuEventKey(key: string | null) {
  if (key === menuKey) return
  menuKey = key
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useMenuOpen(key: string): boolean {
  return useSyncExternalStore(subscribe, () => menuKey === key)
}
