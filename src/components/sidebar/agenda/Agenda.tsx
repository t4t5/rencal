import { useEffect, useEffectEvent, useRef } from "react"
import { flushSync } from "react-dom"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation, useCalendars } from "@/contexts/CalendarStateContext"

import { useCalEventsInfiniteScroll } from "@/hooks/cal-events/useCalEventsInfiniteScroll"
import { useEventsWithDraft } from "@/hooks/cal-events/useEventsWithDraft"
import { useGroupedEvents } from "@/hooks/cal-events/useGroupedEvents"
import { useJumpToScrolledDate } from "@/hooks/cal-events/useJumpToScrolledDate"
import { formatDateKey } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { DaySection } from "./DaySection"
import { GetStartedState } from "./GetStartedState"
import { scrollSectionIntoContainer } from "./scrollSectionIntoContainer"
import { useGhostSection } from "./useGhostSection"
import { useInitialScrollToActiveDate } from "./useInitialScrollToActiveDate"
import { usePreserveScrollOnPrepend } from "./usePreserveScrollOnPrepend"

export function Agenda() {
  const { calendars, isLoadingCalendars } = useCalendars()

  const { activeDate, setActiveDate, registerScrollToDate, isNavigating, setIsNavigating } =
    useCalendarNavigation()

  const { calendarEvents: events, isInitialLoading } = useCalEvents()
  const { events: eventsWithDraft, draftCalEvent } = useEventsWithDraft(events)
  const { eventsByDate, datesWithEvents } = useGroupedEvents({ events: eventsWithDraft })

  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const { sectionsToRender, ghostRef, ghostDateRef, showGhost, clearGhost } = useGhostSection({
    eventsByDate,
    scrollContainerRef,
  })

  useCalEventsInfiniteScroll({ scrollContainerRef })

  const { addSectionRef, sectionRefs } = useJumpToScrolledDate({
    onSetActiveDate: (date) => {
      // Don't let the scroll observer change activeDate while a ghost section is showing:
      if (!ghostDateRef.current) setActiveDate(date)
    },
    datesWithEvents,
    isNavigating,
    scrollContainerRef,
  })

  usePreserveScrollOnPrepend({ scrollContainerRef, sections: sectionsToRender })

  const scrollToDate = useEffectEvent((date: Date, behavior: ScrollBehavior = "smooth") => {
    if (!sectionRefs.current) return

    const targetDateStr = formatDateKey(date)
    const section = sectionRefs.current.get(targetDateStr)

    const container = scrollContainerRef.current
    if (section && container) {
      // Remove ghost synchronously so the scroll target measures the final layout.
      // Otherwise the ghost's height shifts the target up after we scroll, leaving us scrolled past it.
      flushSync(() => clearGhost())
      scrollSectionIntoContainer(container, section, behavior)
    } else {
      showGhost(date, behavior)
    }
  })

  useEffect(() => {
    registerScrollToDate(scrollToDate)
  }, [])

  const hasInitiallyScrolled = useInitialScrollToActiveDate({
    hasEvents: eventsByDate.length > 0,
    activeDate,
    scrollToDate,
    setIsNavigating,
  })

  if (isInitialLoading || isLoadingCalendars) {
    return <div className="grow" />
  }

  if (calendars.length === 0) {
    return <GetStartedState />
  }

  if (events.length === 0) {
    return <div className="p-2 text-sm text-muted-foreground">No events</div>
  }

  return (
    <div
      ref={scrollContainerRef}
      className={cn(
        "grow overflow-auto flex-col gap-6 select-none bg-background",
        !hasInitiallyScrolled && "invisible",
      )}
    >
      {sectionsToRender.map(({ date, events, isGhost }) => {
        const dateStr = formatDateKey(date)

        return (
          <DaySection
            key={dateStr}
            ref={(el) => {
              if (!el) {
                // Clear on unmount so scrollToDate doesn't find a stale detached node
                // and skip the ghost branch (happens when a draft on an empty date is dismissed).
                if (isGhost) {
                  ghostRef.current = null
                } else {
                  sectionRefs.current.delete(dateStr)
                }
                return
              }
              if (isGhost) {
                ghostRef.current = el
              } else {
                addSectionRef(dateStr, el)
              }
            }}
            events={events}
            date={date}
            calendars={calendars}
            draftEvent={draftCalEvent}
          />
        )
      })}
    </div>
  )
}
