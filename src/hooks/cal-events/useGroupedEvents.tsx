import { useMemo, useRef } from "react"

import { CalendarEvent } from "@/lib/cal-events"
import { addDays, formatDateKey, isAllDay, type EventDateTime } from "@/lib/event-time"

function dateKeyToJsDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function useGroupedEvents({ events }: { events: CalendarEvent[] }) {
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>()

    for (const event of events) {
      if (isAllDay(event.start)) {
        const startKey = formatDateKey(event.start)
        const endKey = formatDateKey(event.end)
        let day: EventDateTime = event.start
        while (formatDateKey(day) < endKey) {
          const dateKey = formatDateKey(day)
          const existing = grouped.get(dateKey) || []
          grouped.set(dateKey, [...existing, event])
          day = addDays(day, 1)
        }
        // Single-day all-day event: end equals start day, ensure it's added
        if (startKey >= endKey) {
          const existing = grouped.get(startKey) || []
          grouped.set(startKey, [...existing, event])
        }
      } else {
        const dateKey = formatDateKey(event.start)
        const existing = grouped.get(dateKey) || []
        grouped.set(dateKey, [...existing, event])
      }
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateStr, dayEvents]) => ({
        date: dateKeyToJsDate(dateStr),
        events: dayEvents,
      }))
  }, [events])

  const prevDatesRef = useRef<string[]>([])

  const datesWithEvents = useMemo(() => {
    const newDates = eventsByDate.map(({ date }) => formatLocalDateKey(date))
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

function formatLocalDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${y}-${m < 10 ? "0" : ""}${m}-${day < 10 ? "0" : ""}${day}`
}
