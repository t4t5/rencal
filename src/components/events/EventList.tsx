import { format } from "date-fns"
import { useEffect, useMemo } from "react"

import { DaySection } from "@/components/events/DaySection"

import type { Event } from "@/rpc/bindings"

import { useCalendar } from "@/contexts/CalendarContext"
import { useFetchGoogleEvents } from "@/hooks/useFetchGoogleEvents"

import { useJumpToScrolledDate } from "./useJumpToScrolledDate"

export function EventList() {
  const { activeDate, setActiveDate } = useCalendar()

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

  const { scrollContainerRef, addSectionRef, sectionRefs } = useJumpToScrolledDate({
    onSetActiveDate: setActiveDate,
    datesWithEvents,
  })

  useEffect(() => {
    if (!sectionRefs.current) return

    const section = sectionRefs.current.get(format(activeDate, "yyyy-MM-dd"))
    if (!section) return

    section.scrollIntoView({ behavior: "instant", block: "start" })
  }, [eventsByDate])

  if (isLoading) {
    return <div className="p-2 text-sm text-muted-foreground">Loading events...</div>
  }

  if (events.length === 0) {
    return null
  }

  return (
    <div ref={scrollContainerRef} className="grow overflow-auto flex-col gap-6">
      {eventsByDate.map(({ date, events }) => {
        const dateStr = format(date, "yyyy-MM-dd")

        return (
          <DaySection
            key={date.toISOString()}
            ref={(el) => {
              if (!el) return

              addSectionRef(dateStr, el)
            }}
            events={events}
            date={date}
          />
        )
      })}
    </div>
  )
}
