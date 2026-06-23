import { useMemo } from "react"

import { useCalendars } from "@/contexts/CalendarStateContext"

/**
 * The calendar slugs whose events should be loaded and shown. Single source of truth
 * for every event-loading path (month grid, agenda, jump navigation, initial load).
 */
export function useVisibleCalendarIds(): string[] {
  const { calendars } = useCalendars()
  // TODO: respect calendar visibility
  // return useMemo(() => calendars.filter((c) => c.isVisible).map((c) => c.slug), [calendars])
  return useMemo(() => calendars.map((c) => c.slug), [calendars])
}
