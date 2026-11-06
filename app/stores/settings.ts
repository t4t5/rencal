// Settings the UI reads: mirrors of the backend's, refreshed when it announces a change.
import { signal } from "nsh"

import { api, type CaldirSettings } from "@/lib/api"
import { emitAppEvent } from "@/lib/api/internal"
import type { CalendarGroups } from "@/lib/calendar-groups"
import type { FirstDayOfWeek, TimeFormat } from "@/lib/event-time"

const firstDay = signal<FirstDayOfWeek>("monday")
const timeFormatValue = signal<TimeFormat>("24h")
const weekNumbers = signal(false)
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
export const groups = () => calendarGroups()
export const settingsLoaded = () => loaded()
export const defaultCalendar = () => defaultCalendarSlug()
export const defaultReminders = () => defaultReminderList()
export const autoSyncEnabled = () => autoSync()
export const notificationsEnabled = () => notifications()
export const calendarDir = () => calendarDirValue()

async function refreshConfig() {
  const [day, numbers, loadedGroups, sync, notify] = await Promise.all([
    api.settings.getFirstDayOfWeek(),
    api.settings.getShowWeekNumbers(),
    api.settings.getCalendarGroups(),
    api.settings.getAutoSyncEnabled(),
    api.settings.getNotificationsEnabled(),
  ])
  firstDay.set(day)
  weekNumbers.set(numbers)
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
