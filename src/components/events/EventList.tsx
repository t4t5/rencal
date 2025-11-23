import { format, parse } from "date-fns"
import { useEffect, useMemo, useRef } from "react"

import { DaySection } from "@/components/events/DaySection"

import type { Event } from "@/rpc/bindings"

import { useCalendar } from "@/contexts/CalendarContext"
import { useFetchGoogleEvents } from "@/hooks/useFetchGoogleEvents"

export function EventList() {
  const { activeDate, setActiveDate } = useCalendar()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const activeDateRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef(new Map<string, HTMLDivElement>())

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

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const dateStr = entry.target.getAttribute("data-date")
            if (dateStr) {
              setActiveDate(parse(dateStr, "yyyy-MM-dd", new Date()))
            }
          }
        }
      },
      {
        root: container,
        rootMargin: "0px 0px -90% 0px", // Only top 10% triggers
        threshold: 0,
      },
    )

    sectionRefs.current.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [eventsByDate, setActiveDate])

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

              sectionRefs.current.set(dateStr, el)

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
