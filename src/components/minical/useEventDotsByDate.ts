import { addDays, isBefore, startOfDay } from "date-fns"
import { useMemo } from "react"

import type { CalendarEvent } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"

import { formatDateKey } from "@/lib/time"

export function useEventDotsByDate(): Map<string, string[]> {
  const { calendars } = useCalendars()
  const { calendarEvents } = useCalEvents()

  return useMemo(() => {
    const colorByCalendarSlug = new Map<string, string>()
    for (const cal of calendars) {
      if (cal.color) colorByCalendarSlug.set(cal.slug, cal.color)
    }

    const dotsByDate = new Map<string, string[]>()
    const slugsByDate = new Map<string, Set<string>>()

    const addDot = (dateKey: string, slug: string, color: string) => {
      const slugs = slugsByDate.get(dateKey) ?? new Set()
      if (slugs.has(slug)) return
      slugs.add(slug)
      slugsByDate.set(dateKey, slugs)

      const colors = dotsByDate.get(dateKey) ?? []
      colors.push(color)
      dotsByDate.set(dateKey, colors)
    }

    for (const event of calendarEvents) {
      const color = colorByCalendarSlug.get(event.calendar_slug)
      if (!color) continue

      for (const dateKey of eventDateKeys(event)) {
        addDot(dateKey, event.calendar_slug, color)
      }
    }

    return dotsByDate
  }, [calendarEvents, calendars])
}

function* eventDateKeys(event: CalendarEvent): Generator<string> {
  if (!event.all_day) {
    yield formatDateKey(event.start)
    return
  }

  const start = startOfDay(event.start)
  const end = startOfDay(event.end)

  if (!isBefore(start, end)) {
    yield formatDateKey(start)
    return
  }

  let current = start
  while (isBefore(current, end)) {
    yield formatDateKey(current)
    current = addDays(current, 1)
  }
}
