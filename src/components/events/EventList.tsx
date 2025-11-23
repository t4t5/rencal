import { useEffect, useMemo, useRef } from "react"

import { DaySection } from "@/components/events/DaySection"

import type { Event } from "@/rpc/bindings"

import { useCalendar } from "@/contexts/CalendarContext"
import { useFetchGoogleEvents } from "@/hooks/useFetchGoogleEvents"

export function EventList() {
  const { activeDate } = useCalendar()
  const activeDateRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (activeDateRef.current) {
      activeDateRef.current.scrollIntoView({ behavior: "instant", block: "start" })
    }
  }, [eventsByDate])

  const activeDateStr = activeDate.toISOString().split("T")[0]

  if (isLoading) {
    return <div className="p-2 text-sm text-muted-foreground">Loading events...</div>
  }

  if (events.length === 0) {
    return null
  }

  return (
    <div>
      {eventsByDate.map(({ date, events }) => {
        const dateStr = date.toISOString().split("T")[0]
        const isActiveDate = dateStr === activeDateStr

        return (
          <DaySection
            key={date.toISOString()}
            ref={isActiveDate ? activeDateRef : null}
            events={events}
            date={date}
          />
        )
      })}
    </div>
  )
}
