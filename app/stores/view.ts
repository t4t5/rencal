// The window's layout: which view shows, and whether the sidebar does.
import { signal, windowSize } from "nsh"

import { localStorage } from "@/lib/local-storage"

const MD_BREAKPOINT = 768
const VIEW_KEY = "calendarView"
const COLLAPSED_KEY = "sidebarCollapsed"

const view = signal("month")
const collapsed = signal(false)
const settings = signal(false)
const settingsPage = signal("general")

export const calendarView = () => view()
/** Below `md` the window is one column: the sidebar alone, events in a sheet. */
export const isWideWindow = () => windowSize().width >= MD_BREAKPOINT
export const sidebarCollapsed = () => collapsed()
export const settingsOpen = () => settings()
export const settingsTab = () => settingsPage()

export function setCalendarView(id: string) {
  view.set(id)
  localStorage.setItem(VIEW_KEY, id)
}

export function toggleSidebar() {
  collapsed.update((value) => !value)
  localStorage.setItem(COLLAPSED_KEY, String(collapsed()))
}

export const setSettingsOpen = (open: boolean) => settings.set(open)
export const setSettingsTab = (tab: string) => settingsPage.set(tab)

export function loadViewState() {
  view.set(localStorage.getItem(VIEW_KEY) ?? "month")
  collapsed.set(localStorage.getItem(COLLAPSED_KEY) === "true")
}
