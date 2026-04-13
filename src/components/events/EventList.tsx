import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"

import { DaySection } from "@/components/events/DaySection"

import { CalendarEvent } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation, useCalendars } from "@/contexts/CalendarStateContext"

import { useCalEventsInfiniteScroll } from "@/hooks/cal-events/useCalEventsInfiniteScroll"
import { useEventsWithDraft } from "@/hooks/cal-events/useEventsWithDraft"
import { useGroupedEvents } from "@/hooks/cal-events/useGroupedEvents"
import { useJumpToScrolledDate } from "@/hooks/cal-events/useJumpToScrolledDate"
import { formatDateKey } from "@/lib/time"

type Section = {
  date: Date
  events: CalendarEvent[]
  isGhost: boolean
}

export function EventList() {
  const { calendars } = useCalendars()
  const { activeDate, setActiveDate, registerScrollToDate, isNavigating, setIsNavigating } =
    useCalendarNavigation()
  // TODO: respect calendar visibility
  // const visibleCalendarIds = calendars.filter((c) => c.isVisible).map((c) => c.id)
  const visibleCalendarIds = calendars.map((c) => c.slug)

  const { calendarEvents: events, isInitialLoading } = useCalEvents()
  const { events: eventsWithDraft, draftCalEvent } = useEventsWithDraft(events)
  const { eventsByDate, datesWithEvents } = useGroupedEvents({ events: eventsWithDraft })

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [ghostDate, setGhostDate] = useState<Date | null>(null)
  const ghostDateRef = useRef<Date | null>(null)
  ghostDateRef.current = ghostDate
  const ghostRef = useRef<HTMLDivElement>(null)
  const ghostScrollBehaviorRef = useRef<ScrollBehavior>("smooth")
  const hasInitiallyScrolledRef = useRef(false)
  const prevScrollHeightRef = useRef(0)
  const prevFirstKeyRef = useRef<string | null>(null)

  useCalEventsInfiniteScroll({
    scrollContainerRef,
  })

  const { addSectionRef, sectionRefs } = useJumpToScrolledDate({
    onSetActiveDate: (date) => {
      // Don't let the scroll observer change activeDate while a ghost section is showing:
      if (!ghostDateRef.current) setActiveDate(date)
    },
    datesWithEvents,
    isNavigating,
    scrollContainerRef,
  })

  // Merge ghost date into the sections list:
  const sectionsToRender = useMemo((): Section[] => {
    const sections: Section[] = eventsByDate.map(({ date, events }) => ({
      date,
      events,
      isGhost: false,
    }))

    if (ghostDate) {
      const ghostDateStr = formatDateKey(ghostDate)
      const alreadyExists = sections.some(({ date }) => formatDateKey(date) === ghostDateStr)
      if (!alreadyExists) {
        sections.push({ date: ghostDate, events: [], isGhost: true })
        sections.sort((a, b) => a.date.getTime() - b.date.getTime())
      }
    }

    return sections
  }, [eventsByDate, ghostDate])

  // Preserve scroll position when sections are prepended (e.g. MonthView loading more events
  // into the shared event pool). Without this, prepended DOM nodes push content down.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const currentFirstKey =
      sectionsToRender.length > 0 ? formatDateKey(sectionsToRender[0].date) : null

    if (prevFirstKeyRef.current && currentFirstKey && currentFirstKey !== prevFirstKeyRef.current) {
      const heightDelta = container.scrollHeight - prevScrollHeightRef.current
      if (heightDelta > 0) {
        container.scrollTop += heightDelta
      }
    }

    prevFirstKeyRef.current = currentFirstKey
    prevScrollHeightRef.current = container.scrollHeight
  }, [sectionsToRender])

  // Register scroll function so calendar can trigger scrolling when a date is clicked:
  const scrollToDate = useEffectEvent((date: Date, behavior: ScrollBehavior = "smooth") => {
    if (!sectionRefs.current) return

    const targetDateStr = formatDateKey(date)
    const section = sectionRefs.current.get(targetDateStr)

    if (section) {
      // Remove ghost synchronously so scrollIntoView measures the final layout.
      // Otherwise the ghost's height shifts the target up after we scroll, leaving us scrolled past it.
      flushSync(() => setGhostDate(null))
      section.scrollIntoView({ behavior, block: "start" })
    } else {
      // No events on this date — show a ghost section
      ghostScrollBehaviorRef.current = behavior
      setGhostDate(date)
    }
  })

  // Scroll to ghost section after it renders, and watch for it leaving the viewport:
  useEffect(() => {
    if (!ghostDate || !ghostRef.current || !scrollContainerRef.current) return

    const el = ghostRef.current
    el.scrollIntoView({ behavior: ghostScrollBehaviorRef.current, block: "start" })

    // Remove ghost when user scrolls it out of view:
    let hasBeenVisible = false
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          hasBeenVisible = true
        } else if (hasBeenVisible) {
          setGhostDate(null)
        }
      },
      { root: scrollContainerRef.current, threshold: 0 },
    )
    observer.observe(el)

    return () => observer.disconnect()
  }, [ghostDate])

  useEffect(() => {
    registerScrollToDate(scrollToDate)
  }, [])

  useEffect(() => {
    if (hasInitiallyScrolledRef.current) return
    if (eventsByDate.length === 0) return

    hasInitiallyScrolledRef.current = true

    // Scroll to currently active date as soon as events have loaded:
    setIsNavigating(true)

    // Wait for intersection observers to process before clearing flag
    // 1: browser paints scroll position:
    requestAnimationFrame(() => {
      // 2: intersectionObserver callbacks are processed:
      requestAnimationFrame(() => {
        scrollToDate(activeDate, "instant")
        setIsNavigating(false)
      })
    })
  }, [eventsByDate])

  if (isInitialLoading) {
    return <div className="grow" />
  }

  if (events.length === 0) {
    return <div className="p-2 text-sm text-muted-foreground">No events</div>
  }

  return (
    <div ref={scrollContainerRef} className="grow overflow-auto flex-col gap-6 select-none">
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
