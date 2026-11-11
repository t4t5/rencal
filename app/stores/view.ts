// The window's layout: which view shows, and whether the sidebar does.
import { LayoutAnimation, signal, windowSize } from "nsh"
import { focusedWindow, Window } from "nsh/desktop"

import { localStorage } from "@/lib/local-storage"

const MD_BREAKPOINT = 768
const VIEW_KEY = "calendarView"
const COLLAPSED_KEY = "sidebarCollapsed"
const SIDEBAR_SLIDE_MS = 200

const view = signal("month")
const collapsed = signal(false)
const settings = signal(false)
const settingsPage = signal("general")

export const SETTINGS_WINDOW = "settings"

export const calendarView = () => view()
/** Below `md` the window is one column: the sidebar alone, events in a sheet. */
export const isWideWindow = () => windowSize().width >= MD_BREAKPOINT
export const sidebarCollapsed = () => collapsed()
export const settingsOpen = () => settings()
export const settingsTab = () => settingsPage()
export const settingsFocused = () => focusedWindow()?.id === SETTINGS_WINDOW

export function setCalendarView(id: string) {
  view.set(id)
  localStorage.setItem(VIEW_KEY, id)
}

export function toggleSidebar() {
  LayoutAnimation.configureNext(LayoutAnimation.create(SIDEBAR_SLIDE_MS, "easeInEaseOut"))
  collapsed.update((value) => !value)
  localStorage.setItem(COLLAPSED_KEY, String(collapsed()))
}

/** Opens Settings' window, or brings it forward when it's open already. */
export function openSettings() {
  if (settings()) Window.get(SETTINGS_WINDOW)?.focus()
  else settings.set(true)
}

export const setSettingsOpen = (open: boolean) => settings.set(open)
export const setSettingsTab = (tab: string) => settingsPage.set(tab)

export function loadViewState() {
  view.set(localStorage.getItem(VIEW_KEY) ?? "month")
  collapsed.set(localStorage.getItem(COLLAPSED_KEY) === "true")
}
