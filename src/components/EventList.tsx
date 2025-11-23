import { useMemo } from "react"

import { DaySection } from "@/components/events/DaySection"

import type { Event } from "@/rpc/bindings"

import { useFetchGoogleEvents } from "@/hooks/useFetchGoogleEvents"

export function EventList({ activeDate }: { activeDate: Date }) {
  const { events, isLoading } = useFetchGoogleEvents({
    activeDate,
  })

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

  if (isLoading) {
    return <div className="p-2 text-sm text-muted-foreground">Loading events...</div>
  }

  if (events.length === 0) {
    return null
  }

  return (
    <div>
      {eventsByDate.map(({ date, events }) => (
        <DaySection key={date.toISOString()} events={events} date={date} />
      ))}
    </div>
  )
}
