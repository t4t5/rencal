import { useSyncExternalStore } from "react"
import { z } from "zod"

const KEY = "rencal-sidebar-collapsed"
const schema = z.boolean()

let collapsed = readInitial()
const listeners = new Set<() => void>()

function readInitial(): boolean {
  const raw = localStorage.getItem(KEY)
  if (raw === null) return false
  const parsed = schema.safeParse(JSON.parse(raw))
  return parsed.success ? parsed.data : false
}

function setCollapsed(next: boolean) {
  collapsed = next
  localStorage.setItem(KEY, JSON.stringify(next))
  listeners.forEach((listener) => listener())
}

function toggleCollapsed() {
  setCollapsed(!collapsed)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSidebarCollapse() {
  const value = useSyncExternalStore(subscribe, () => collapsed)
  return { collapsed: value, setCollapsed, toggleCollapsed }
}
