import { addDays, format, isBefore, startOfDay } from "date-fns"
import { useMemo } from "react"

import { CalendarEvent } from "@/rpc/bindings"

export function useGroupedEvents({ events }: { events: CalendarEvent[] }) {
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>()

    for (const event of events) {
      if (event.all_day) {
        const start = startOfDay(event.start)
        const end = startOfDay(event.end)
        let day = start
        while (isBefore(day, end)) {
          const dateKey = format(day, "yyyy-MM-dd")
          const existing = grouped.get(dateKey) || []
          grouped.set(dateKey, [...existing, event])
          day = addDays(day, 1)
        }
        // If start equals end (single-day all-day event), ensure it's added
        if (!isBefore(start, end)) {
          const dateKey = format(start, "yyyy-MM-dd")
          const existing = grouped.get(dateKey) || []
          grouped.set(dateKey, [...existing, event])
        }
      } else {
        const dateKey = format(event.start, "yyyy-MM-dd")
        const existing = grouped.get(dateKey) || []
        grouped.set(dateKey, [...existing, event])
      }
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateStr, dayEvents]) => ({
        date: new Date(dateStr),
        events: dayEvents,
      }))
  }, [events])

  const datesWithEvents = useMemo(() => {
    return eventsByDate.map(({ date }) => format(date, "yyyy-MM-dd"))
  }, [eventsByDate])

  return {
    eventsByDate,
    datesWithEvents,
  }
}
