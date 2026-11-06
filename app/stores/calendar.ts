// Which calendars exist, which group shows, and the day everything centers on.
import { Temporal } from "@js-temporal/polyfill"
import { computed, signal } from "nsh"

import { api, type Calendar } from "@/lib/api"
import {
  ACTIVE_GROUP_KEY,
  getStoredActiveGroup,
  getVisibleCalendarSlugs,
} from "@/lib/calendar-groups"
import { today } from "@/lib/event-time"
import { localStorage } from "@/lib/local-storage"

import { groups } from "@/stores/settings"

const calendarList = signal<Calendar[]>([])
const group = signal("default")
const active = signal<Temporal.PlainDate>(today(), { equals: (a, b) => a.equals(b) })

export const calendars = () => calendarList()
export const activeGroup = () => group()
export const activeDate = () => active()

export const visibleSlugs = computed(() =>
  getVisibleCalendarSlugs({ calendars: calendarList(), groups: groups(), activeGroup: group() }),
)

const calendarBySlug = computed(() => new Map(calendarList().map((c) => [c.slug, c])))
export const calendarOf = (slug: string) => calendarBySlug().get(slug)

export function setActiveGroup(name: string) {
  group.set(name)
  localStorage.setItem(ACTIVE_GROUP_KEY, JSON.stringify(name))
}

type NavigationListener = (date: Temporal.PlainDate) => void
const navigationListeners = new Set<NavigationListener>()

/** Scrollable views follow navigation here; returns how to stop. */
export function onNavigate(listener: NavigationListener) {
  navigationListeners.add(listener)
  return () => void navigationListeners.delete(listener)
}

/** Moves the active day and brings every view to it. */
export function navigateToDate(date: Temporal.PlainDate) {
  active.set(date)
  for (const listener of navigationListeners) listener(date)
}

/** Moves the active day without scrolling the views, as a scroll that reached it does. */
export const setActiveDate = (date: Temporal.PlainDate) => active.set(date)

export async function reloadCalendars() {
  calendarList.set(await api.calendars.list())
}

export async function loadCalendars() {
  group.set(getStoredActiveGroup(localStorage))
  await reloadCalendars()
  api.notifications.listen("calendars-changed", () => void reloadCalendars())
}
