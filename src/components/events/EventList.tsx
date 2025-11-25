import { format } from "date-fns"
import { useEffect, useEffectEvent } from "react"

import { DaySection } from "@/components/events/DaySection"

import { useCalendar } from "@/contexts/CalendarContext"
import { useLocalEvents } from "@/hooks/useLocalEvents"

import { useGroupedEvents } from "./useGroupedEvents"
import { useJumpToScrolledDate } from "./useJumpToScrolledDate"

export function EventList() {
  const {
    activeDate,
    setActiveDate,
    registerScrollToDate,
    registerLoadEventsForDate,
    isNavigating,
  } = useCalendar()

  const { events, isLoading, loadEventsForDate } = useLocalEvents()

  const { eventsByDate, datesWithEvents } = useGroupedEvents({ events })

  const { scrollContainerRef, addSectionRef, sectionRefs } = useJumpToScrolledDate({
    onSetActiveDate: setActiveDate,
    datesWithEvents,
    isNavigating,
  })

  // Register loadEventsForDate so navigation can load events before scrolling:
  const onRegisterLoadEvents = useEffectEvent(() => {
    registerLoadEventsForDate(loadEventsForDate)
  })

  useEffect(() => {
    onRegisterLoadEvents()
  }, [])

  // Register scroll function so calendar can trigger scrolling when a date is clicked:
  const scrollToDate = useEffectEvent((date: Date) => {
    if (!sectionRefs.current) return

    const targetDateStr = format(date, "yyyy-MM-dd")

    // Try exact date first
    let section = sectionRefs.current.get(targetDateStr)

    // If no events on that date, find the closest previous date with events
    if (!section) {
      const availableDates = [...sectionRefs.current.keys()].sort()
      const closestPrevDate = availableDates.filter((d) => d <= targetDateStr).pop()

      if (closestPrevDate) {
        section = sectionRefs.current.get(closestPrevDate)
      }
    }

    section?.scrollIntoView({ behavior: "smooth", block: "start" })
  })

  useEffect(() => {
    registerScrollToDate(scrollToDate)
  }, [])

  // Scroll to currently active date as soon as events have loaded:
  const scrollToActiveDateOnLoad = useEffectEvent(() => {
    if (!sectionRefs.current) return

    const section = sectionRefs.current.get(format(activeDate, "yyyy-MM-dd"))
    if (!section) return

    section.scrollIntoView({ behavior: "instant", block: "start" })
  })

  useEffect(() => {
    scrollToActiveDateOnLoad()
  }, [eventsByDate])

  if (isLoading && events.length === 0) {
    return <div className="p-2 text-sm text-muted-foreground">Loading events...</div>
  }

  if (events.length === 0) {
    return <div className="p-2 text-sm text-muted-foreground">No events</div>
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
