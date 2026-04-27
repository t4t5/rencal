import { useMemo } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"

import type { CalendarEvent } from "@/lib/cal-events"
import { addDays, formatDateKey, isAllDay, type EventDateTime } from "@/lib/event-time"

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
  if (!isAllDay(event.start)) {
    yield formatDateKey(event.start)
    return
  }

  // All-day: enumerate dates from start (inclusive) until end (exclusive).
  let current: EventDateTime = event.start
  const endKey = formatDateKey(event.end)
  const startKey = formatDateKey(event.start)
  if (startKey >= endKey) {
    yield startKey
    return
  }
  while (formatDateKey(current) < endKey) {
    yield formatDateKey(current)
    current = addDays(current, 1)
  }
}
