// Settings the UI reads: mirrors of the backend's, refreshed when it announces a change.
import { computed, signal } from "nsh"

import { api, type CaldirSettings } from "@/lib/api"
import { emitAppEvent } from "@/lib/api/internal"
import type { CalendarGroups } from "@/lib/calendar-groups"
import { provideCalendarPrefs } from "@/lib/calendar-prefs"
import { type FirstDayOfWeek, normalizeExtraTimeZones, type TimeFormat } from "@/lib/event-time"

import { currentDay, viewerTzid } from "@/stores/clock"

const firstDay = signal<FirstDayOfWeek>("monday")
const timeFormatValue = signal<TimeFormat>("24h")
const weekNumbers = signal(false)
// Every config change re-reads the settings: keep the array while its zones are the same.
const storedZones = signal<string[]>([], {
  equals: (a, b) => a.length === b.length && a.every((tzid, i) => tzid === b[i]),
})
const calendarGroups = signal<CalendarGroups>({})
const defaultCalendarSlug = signal<string | null>(null)
const defaultReminderList = signal<number[]>([])
const autoSync = signal(true)
const notifications = signal(true)
const calendarDirValue = signal("")
const loaded = signal(false)

export const firstDayOfWeek = () => firstDay()
export const timeFormat = () => timeFormatValue()
export const showWeekNumbers = () => weekNumbers()
/** The zones the day and week views show next to the viewer's, as config.toml has them. */
export const storedTimeZones = () => storedZones()
/** The extra zones to show: a zone the viewer is in has nothing to add next to their own. */
export const extraTimeZones = computed(() => storedZones().filter((tzid) => tzid !== viewerTzid()))
export const groups = () => calendarGroups()
export const settingsLoaded = () => loaded()
export const defaultCalendar = () => defaultCalendarSlug()
export const defaultReminders = () => defaultReminderList()
export const autoSyncEnabled = () => autoSync()
export const notificationsEnabled = () => notifications()
export const calendarDir = () => calendarDirValue()

provideCalendarPrefs({ today: currentDay, firstDayOfWeek, showWeekNumbers })

async function refreshConfig() {
  const [day, numbers, zones, loadedGroups, sync, notify] = await Promise.all([
    api.settings.getFirstDayOfWeek(),
    api.settings.getShowWeekNumbers(),
    api.settings.getExtraTimeZones(),
    api.settings.getCalendarGroups(),
    api.settings.getAutoSyncEnabled(),
    api.settings.getNotificationsEnabled(),
  ])
  firstDay.set(day)
  weekNumbers.set(numbers)
  storedZones.set(zones)
  calendarGroups.set(loadedGroups)
  autoSync.set(sync)
  notifications.set(notify)
}

function applyCaldirSettings(settings: CaldirSettings) {
  timeFormatValue.set(settings.time_format)
  defaultCalendarSlug.set(settings.default_calendar)
  defaultReminderList.set(settings.default_reminders)
  calendarDirValue.set(settings.calendar_dir)
}

/** Connecting a provider can change what caldir's config holds. */
export async function reloadSettings() {
  const [caldir] = await Promise.all([api.settings.getCaldirSettings(), refreshConfig()])
  applyCaldirSettings(caldir)
}

export async function loadSettings() {
  const [caldir] = await Promise.all([api.settings.getCaldirSettings(), refreshConfig()])
  applyCaldirSettings(caldir)
  loaded.set(true)

  api.notifications.listen("rencal-config-changed", () => void refreshConfig())
  api.notifications.listen("caldir-config-changed", applyCaldirSettings)
}

export async function setTimeFormat(format: TimeFormat) {
  timeFormatValue.set(format)
  await api.settings.setTimeFormat(format)
}

export async function setDefaultReminders(minutes: number[]) {
  defaultReminderList.set(minutes)
  await api.settings.setDefaultReminders(minutes)
}

export async function setDefaultCalendar(slug: string | null) {
  defaultCalendarSlug.set(slug)
  await api.settings.setDefaultCalendar(slug)
}

// The state bridge broadcasts the complete stored settings after the save.
export const setCalendarDir = (path: string) => api.settings.setCalendarDir(path)

export async function setNotificationsEnabled(enabled: boolean) {
  notifications.set(enabled)
  await api.settings.setNotificationsEnabled(enabled)
  await emitAppEvent("rencal-config-changed")
}

export async function setFirstDayOfWeek(day: FirstDayOfWeek) {
  firstDay.set(day)
  await api.settings.setFirstDayOfWeek(day)
  await emitAppEvent("rencal-config-changed")
}

export async function setShowWeekNumbers(show: boolean) {
  weekNumbers.set(show)
  await api.settings.setShowWeekNumbers(show)
  await emitAppEvent("rencal-config-changed")
}

export async function setExtraTimeZones(zones: string[]) {
  const next = normalizeExtraTimeZones(zones)
  storedZones.set(next)
  await api.settings.setExtraTimeZones(next)
  await emitAppEvent("rencal-config-changed")
}

export async function setAutoSyncEnabled(enabled: boolean) {
  autoSync.set(enabled)
  await api.settings.setAutoSyncEnabled(enabled)
  await emitAppEvent("rencal-config-changed")
}

export async function setGroups(next: CalendarGroups) {
  calendarGroups.set(next)
  await api.settings.setCalendarGroups(next)
  await emitAppEvent("rencal-config-changed")
}
