/*
 * The user's calendar preferences, as shared UI (the date picker) reads them.
 * renCal's stores provide them (`stores/settings.ts`); a view plugin's SDK
 * provides renCal's, so the same components run in the plugin's engine.
 */
import type { Temporal } from "@js-temporal/polyfill"

import { type FirstDayOfWeek, today } from "@/lib/event-time"

type CalendarPrefs = {
  today: () => Temporal.PlainDate
  firstDayOfWeek: () => FirstDayOfWeek
  showWeekNumbers: () => boolean
}

let prefs: CalendarPrefs = {
  today,
  firstDayOfWeek: () => "monday",
  showWeekNumbers: () => false,
}

export const calendarPrefs = (): CalendarPrefs => prefs

export function provideCalendarPrefs(next: CalendarPrefs) {
  prefs = next
}
