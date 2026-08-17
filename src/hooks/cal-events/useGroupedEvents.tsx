import { Temporal } from "@js-temporal/polyfill"
import { useMemo, useRef } from "react"

import { CalendarEvent } from "@/lib/cal-events"
import { enumerateLocalDays } from "@/lib/event-time"

export function useGroupedEvents({ events }: { events: CalendarEvent[] }) {
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, { date: Temporal.PlainDate; events: CalendarEvent[] }>()

    for (const event of events) {
      for (const date of enumerateLocalDays(event.start, event.end)) {
        const dateKey = date.toString()
        const existing = grouped.get(dateKey)
        if (existing) existing.events.push(event)
        else grouped.set(dateKey, { date, events: [event] })
      }
    }

    return Array.from(grouped.entries())
      .sort(([, a], [, b]) => Temporal.PlainDate.compare(a.date, b.date))
      .map(([dateKey, { date, events }]) => ({
        dateKey,
        date,
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
