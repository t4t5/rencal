import { useMemo, useRef } from "react"

import { CalendarEvent } from "@/lib/cal-events"
import { dateKeyToPlainDate, enumerateLocalDateKeys } from "@/lib/event-time"

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
        date: dateKeyToPlainDate(dateKey),
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
