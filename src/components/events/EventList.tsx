import { format } from "date-fns"
import { useEffect, useEffectEvent, useRef } from "react"

import { DaySection } from "@/components/events/DaySection"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"

import { useRollingEvents } from "@/hooks/useRollingEvents"

import { useGroupedEvents } from "./useGroupedEvents"
import { useJumpToScrolledDate } from "./useJumpToScrolledDate"

export function EventList() {
  const {
    calendars,
    activeDate,
    setActiveDate,
    registerScrollToDate,
    isNavigating,
    setIsNavigating,
  } = useCalendarState()
  const visibleCalendarIds = calendars.filter((c) => c.isVisible).map((c) => c.id)

  const { calendarEvents: events, reloadEvents, currentDateRangeRef } = useCalEvents()
  const { eventsByDate, datesWithEvents } = useGroupedEvents({ events })

  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useRollingEvents({
    scrollContainerRef,
  })

  const { addSectionRef, sectionRefs } = useJumpToScrolledDate({
    onSetActiveDate: setActiveDate,
    datesWithEvents,
    isNavigating,
    scrollContainerRef,
  })

  useEffect(() => {
    // Initialize on first run:
    if (!currentDateRangeRef.current) {
      reloadEvents()
    }
  }, [activeDate, visibleCalendarIds])

  // Register scroll function so calendar can trigger scrolling when a date is clicked:
  const scrollToDate = useEffectEvent((date: Date, behavior: ScrollBehavior = "smooth") => {
    if (!sectionRefs.current) return

    const targetDateStr = format(date, "yyyy-MM-dd")

    // Try exact date first
    let section = sectionRefs.current.get(targetDateStr)

    // If no events on that date, find the closest next date with events
    if (!section) {
      const availableDates = [...sectionRefs.current.keys()].sort()
      const closestNextDate = availableDates.find((d) => d >= targetDateStr)

      if (closestNextDate) {
        section = sectionRefs.current.get(closestNextDate)
      }
    }

    section?.scrollIntoView({ behavior, block: "start" })
  })

  useEffect(() => {
    registerScrollToDate(scrollToDate)
  }, [])

  useEffect(() => {
    // Scroll to currently active date as soon as events have loaded:
    setIsNavigating(true)
    scrollToDate(activeDate, "instant")

    // Wait for intersection observers to process before clearing flag
    // 1: browser paints scroll position:
    requestAnimationFrame(() => {
      // 2: intersectionObserver callbacks are processed:
      requestAnimationFrame(() => {
        setIsNavigating(false)
      })
    })
  }, [eventsByDate])

  if (events.length === 0) {
    return <div className="p-2 text-sm text-muted-foreground">No events</div>
  }

  return (
    <div ref={scrollContainerRef} className="grow overflow-auto flex-col gap-6">
      {eventsByDate.map(({ date, events }) => {
        const dateStr = format(date, "yyyy-MM-dd")

        return (
          <DaySection
            key={dateStr}
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
