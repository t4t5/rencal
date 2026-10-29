import { useSyncExternalStore } from "react"
import z from "zod"

import { DEFAULT_VIEW_ID } from "@/views/default-view"

const CALENDAR_VIEW_KEY = "calendarView"
const schema = z.string()

// Stored as-is: unknown ids fall back at render time, so a plugin view that
// loads late or fails to load doesn't overwrite the user's preference.
let calendarView = readInitial()
// In memory only: where a view that offers "back" (Esc) returns to.
let previousView: string | null = null
let leaveGuard: (() => Promise<boolean>) | null = null
const listeners = new Set<() => void>()

function readInitial(): string {
  try {
    const raw = localStorage.getItem(CALENDAR_VIEW_KEY)
    if (raw === null) return DEFAULT_VIEW_ID
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : DEFAULT_VIEW_ID
  } catch {
    return DEFAULT_VIEW_ID
  }
}

/** Switch views, unless the current view's leave guard says no. */
async function setCalendarView(next: string) {
  if (next === calendarView) return
  if (leaveGuard && !(await leaveGuard())) return
  previousView = calendarView
  calendarView = next
  localStorage.setItem(CALENDAR_VIEW_KEY, JSON.stringify(next))
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The view shown before the current one this session, if any. */
export function getPreviousCalendarView(): string | null {
  return previousView
}

/**
 * Lets the active view hold the user back, e.g. to confirm discarding a
 * draft. Returns the cleanup that removes it.
 */
export function setCalendarViewLeaveGuard(guard: () => Promise<boolean>): () => void {
  leaveGuard = guard
  return () => {
    if (leaveGuard === guard) leaveGuard = null
  }
}

export const useCalendarView = () => {
  const value = useSyncExternalStore(subscribe, () => calendarView)
  return {
    calendarView: value,
    setCalendarView: (view: string) => void setCalendarView(view),
  }
}
