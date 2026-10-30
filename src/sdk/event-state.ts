import { useSyncExternalStore } from "react"

import type { CalendarEvent as AppEvent } from "@/lib/cal-events"

// Drafts are app events built per keystroke; remember which ones so blocks can
// tell them apart from saved events without a field on the plugin event.
const drafts = new WeakSet<AppEvent>()

export function markDraft(event: AppEvent) {
  drafts.add(event)
}

export function isDraft(event: AppEvent): boolean {
  return drafts.has(event)
}

// Only one context menu is open at a time, so one key covers every block.
let menuKey: string | null = null
const listeners = new Set<() => void>()

export function setMenuEvent(key: string, open: boolean) {
  if (open === (menuKey === key)) return
  menuKey = open ? key : null
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useMenuOpen(key: string): boolean {
  return useSyncExternalStore(subscribe, () => menuKey === key)
}
