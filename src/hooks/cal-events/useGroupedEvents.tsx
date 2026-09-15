import { useMemo, useRef } from "react"

import { CalendarEvent } from "@/lib/cal-events"
import { dateKeyFromEpochDay, occupiedDays, plainDateFromEpochDay } from "@/lib/event-time"

export function useGroupedEvents({ events }: { events: CalendarEvent[] }) {
  const eventsByDate = useMemo(() => {
    // Group on epoch-day ints; dates are materialised once per day from the cache.
    const grouped = new Map<number, CalendarEvent[]>()

    for (const event of events) {
      for (const day of occupiedDays(event.dateInfo)) {
        const existing = grouped.get(day)
        if (existing) existing.push(event)
        else grouped.set(day, [event])
      }
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a - b)
      .map(([day, events]) => ({
        dateKey: dateKeyFromEpochDay(day),
        date: plainDateFromEpochDay(day),
        events,
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
