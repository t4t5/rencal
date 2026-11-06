/*
 * Persisted settings. caldir-backed values (time format, reminders, default
 * calendar, calendar dir) are broadcast back as `caldir-config-changed` by the
 * backend after a write; config.toml-backed values are not, so their callers
 * emit `rencal-config-changed` themselves (see SettingsContext).
 */
import { rpc } from "@/rpc"
import type { CaldirSettings } from "@/rpc/bindings"

import { normalizeCalendarGroups, type CalendarGroups } from "@/lib/calendar-groups"
import type { FirstDayOfWeek, TimeFormat } from "@/lib/event-time"

export type { CaldirSettings }

export function getCaldirSettings(): Promise<CaldirSettings> {
  return rpc.caldir.get_caldir_settings()
}

export async function setTimeFormat(timeFormat: TimeFormat): Promise<void> {
  await rpc.caldir.set_time_format(timeFormat)
}

export async function setDefaultReminders(minutes: number[]): Promise<void> {
  await rpc.caldir.set_default_reminders(minutes)
}

export async function setDefaultCalendar(slug: string | null): Promise<void> {
  await rpc.caldir.set_default_calendar(slug)
}

export async function setCalendarDir(path: string): Promise<void> {
  await rpc.caldir.set_calendar_dir(path)
}

export function getNotificationsEnabled(): Promise<boolean> {
  return rpc.config.get_notifications_enabled()
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  await rpc.config.set_notifications_enabled(enabled)
}

export function getAutoSyncEnabled(): Promise<boolean> {
  return rpc.config.get_auto_sync_enabled()
}

export async function setAutoSyncEnabled(enabled: boolean): Promise<void> {
  await rpc.config.set_auto_sync_enabled(enabled)
}

export function getFirstDayOfWeek(): Promise<FirstDayOfWeek> {
  return rpc.config.get_first_day_of_week()
}

export async function setFirstDayOfWeek(day: FirstDayOfWeek): Promise<void> {
  await rpc.config.set_first_day_of_week(day)
}

export function getShowWeekNumbers(): Promise<boolean> {
  return rpc.config.get_show_week_numbers()
}

export async function setShowWeekNumbers(show: boolean): Promise<void> {
  await rpc.config.set_show_week_numbers(show)
}

/** Named calendar groups from config.toml's `[groups]` table, with malformed entries dropped. */
export async function getCalendarGroups(): Promise<CalendarGroups> {
  return normalizeCalendarGroups(await rpc.config.get_groups())
}

export async function setCalendarGroups(groups: CalendarGroups): Promise<void> {
  await rpc.config.set_groups(groups)
}

export const settings = {
  getCaldirSettings,
  setTimeFormat,
  setDefaultReminders,
  setDefaultCalendar,
  setCalendarDir,
  getNotificationsEnabled,
  setNotificationsEnabled,
  getAutoSyncEnabled,
  setAutoSyncEnabled,
  getFirstDayOfWeek,
  setFirstDayOfWeek,
  getShowWeekNumbers,
  setShowWeekNumbers,
  getCalendarGroups,
  setCalendarGroups,
} as const
