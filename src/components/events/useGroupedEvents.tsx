import { format } from "date-fns"
import { useMemo } from "react"

import type { Event } from "@/rpc/bindings"

export function useGroupedEvents({ events }: { events: Event[] }) {
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, Event[]>()

    for (const event of events) {
      const dateKey = event.start.split("T")[0]
      const existing = grouped.get(dateKey) || []
      grouped.set(dateKey, [...existing, event])
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
