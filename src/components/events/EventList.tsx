import { format } from "date-fns"
import { useEffect, useMemo, useRef } from "react"

import { DaySection } from "@/components/events/DaySection"

import type { Event } from "@/rpc/bindings"

import { useCalendar } from "@/contexts/CalendarContext"
import { useFetchGoogleEvents } from "@/hooks/useFetchGoogleEvents"

import { useJumpToScrolledDate } from "./useJumpToScrolledDate"

export function EventList() {
  const { activeDate, setActiveDate } = useCalendar()
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

  const datesWithEvents = useMemo(() => {
    return eventsByDate.map(({ date }) => format(date, "yyyy-MM-dd"))
  }, [eventsByDate])

  useEffect(() => {
    if (activeDateRef.current) {
      activeDateRef.current.scrollIntoView({ behavior: "instant", block: "start" })
    }
  }, [eventsByDate])

  const { scrollContainerRef, addSectionRef } = useJumpToScrolledDate({
    onSetActiveDate: setActiveDate,
    datesWithEvents,
  })

  if (isLoading) {
    return <div className="p-2 text-sm text-muted-foreground">Loading events...</div>
  }

  if (events.length === 0) {
    return null
  }

  return (
    <div ref={scrollContainerRef} className="grow overflow-auto flex-col gap-6">
      {eventsByDate.map(({ date, events }) => {
        const activeDateStr = format(activeDate, "yyyy-MM-dd")
        const dateStr = format(date, "yyyy-MM-dd")

        const isActiveDate = activeDateStr === dateStr

        return (
          <DaySection
            key={date.toISOString()}
            ref={(el) => {
              if (!el) return

              addSectionRef(dateStr, el)

              if (isActiveDate) {
                activeDateRef.current = el
              }
            }}
            data-date={dateStr}
            events={events}
            date={date}
          />
        )
      })}
    </div>
  )
}
