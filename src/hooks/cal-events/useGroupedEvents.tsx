import { useMemo, useRef } from "react"

import { CalendarEvent } from "@/lib/cal-events"
import { enumerateLocalDateKeys } from "@/lib/event-time"

function dateKeyToJsDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function useGroupedEvents({ events }: { events: CalendarEvent[] }) {
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>()

    for (const event of events) {
      for (const dateKey of enumerateLocalDateKeys(event.start, event.end)) {
        const existing = grouped.get(dateKey)
        if (existing) existing.push(event)
        else grouped.set(dateKey, [event])
      }
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, dayEvents]) => ({
        dateKey,
        date: dateKeyToJsDate(dateKey),
        events: dayEvents,
      }))
  }, [events])

  const prevDatesRef = useRef<string[]>([])

  const datesWithEvents = useMemo(() => {
    const newDates = eventsByDate.map(({ dateKey }) => dateKey)
    const prev = prevDatesRef.current
    if (newDates.length === prev.length && newDates.every((d, i) => d === prev[i])) {
      return prev
    }
    prevDatesRef.current = newDates
    return newDates
  }, [eventsByDate])

  return {
    eventsByDate,
    datesWithEvents,
  }
}
