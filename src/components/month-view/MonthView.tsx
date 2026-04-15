import { addMonths, endOfMonth, isSameDay, startOfMonth, subMonths } from "date-fns"
import { useCallback, useRef, useState } from "react"

import { MonthGrid } from "@/components/month-view/MonthGrid"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation, useCalendars } from "@/contexts/CalendarStateContext"

import { useEventsWithDraft } from "@/hooks/cal-events/useEventsWithDraft"
import { useMonthEventLayout } from "@/hooks/cal-events/useMonthEventLayout"
import { useMonthGrid } from "@/hooks/cal-events/useMonthGrid"
import { useScrollBoundary } from "@/hooks/useScrollBoundary"
import { getCalendarEventsForRange, MONTHS_TO_LOAD } from "@/lib/cal-events-range"
import { formatDateKey } from "@/lib/time"
import { cn } from "@/lib/utils"

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function MonthView() {
  const { calendars } = useCalendars()
  const { activeDate, setActiveDate, navigateToDate, isNavigating } = useCalendarNavigation()
  const {
    calendarEvents,
    setCalendarEvents,
    toggleActiveEventId,
    activeEvent,
    currentDateRangeRef,
  } = useCalEvents()

  // TODO: respect calendar visibility
  const visibleCalendarIds = calendars.map((c) => c.slug)

  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Range of months to generate weeks for (only grows, never shrinks)
  const [rangeStart, setRangeStart] = useState(() => startOfMonth(subMonths(activeDate, 2)))
  const [rangeEnd, setRangeEnd] = useState(() => startOfMonth(addMonths(activeDate, 3)))

  const weeks = useMonthGrid(rangeStart, rangeEnd)
  const { events, draftCalEvent } = useEventsWithDraft(calendarEvents)
  const weekLayouts = useMonthEventLayout(weeks, events, calendars)

  // Compute initial anchor week (the week containing the 1st of activeDate's month)
  const initialAnchorRef = useRef(startOfMonth(activeDate))
  const anchorWeekIndex = weeks.findIndex((week) =>
    week.some((d) => isSameDay(d.date, initialAnchorRef.current)),
  )

  // Guard against concurrent event fetches (grid can outpace async loads)
  const isLoadingRef = useRef(false)

  // Extend the grid AND load events when scrolling near edges
  useScrollBoundary({
    scrollContainerRef: scrollRef,
    threshold: 200,
    onNearTop: useCallback(async () => {
      if (isLoadingRef.current) return
      isLoadingRef.current = true

      try {
        // Load events BEFORE extending the grid so they're already available
        // when the new rows render (scroll adjustment makes them instantly visible)
        const currentRange = currentDateRangeRef.current
        if (!currentRange) return
        const prevStart = startOfMonth(subMonths(currentRange.start, MONTHS_TO_LOAD))
        const prevEvents = await getCalendarEventsForRange(
          visibleCalendarIds,
          prevStart,
          currentRange.start,
        )
        setCalendarEvents((prev) => {
          const existingIds = new Set(prev.map((e) => e.id))
          const newEvents = prevEvents.filter((e) => !existingIds.has(e.id))
          return newEvents.length ? [...newEvents, ...prev] : prev
        })
        currentDateRangeRef.current = { start: prevStart, end: currentRange.end }

        // Now extend the grid (events are already in state)
        setRangeStart((prev) => startOfMonth(subMonths(prev, 2)))
      } finally {
        isLoadingRef.current = false
      }
    }, [visibleCalendarIds]),
    onNearBottom: useCallback(async () => {
      if (isLoadingRef.current) return
      isLoadingRef.current = true

      try {
        setRangeEnd((prev) => startOfMonth(addMonths(prev, 2)))

        const currentRange = currentDateRangeRef.current
        if (!currentRange) return
        const nextEnd = endOfMonth(addMonths(currentRange.end, MONTHS_TO_LOAD))
        const nextEvents = await getCalendarEventsForRange(
          visibleCalendarIds,
          currentRange.end,
          nextEnd,
        )
        setCalendarEvents((prev) => {
          const existingIds = new Set(prev.map((e) => e.id))
          const newEvents = nextEvents.filter((e) => !existingIds.has(e.id))
          return newEvents.length ? [...prev, ...newEvents] : prev
        })
        currentDateRangeRef.current = { start: currentRange.start, end: nextEnd }
      } finally {
        isLoadingRef.current = false
      }
    }, [visibleCalendarIds]),
  })

  return (
    <div className="flex flex-col grow w-full h-full">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={cn(
              "text-[11px]! text-muted-foreground py-2 text-center font-medium font-numerical uppercase",
              i >= 5 && "bg-weekendBg",
            )}
          >
            {label}
          </div>
        ))}
      </div>

      <MonthGrid
        weeks={weeks}
        weekLayouts={weekLayouts}
        activeEventId={activeEvent?.id ?? null}
        activeDateKey={formatDateKey(activeDate)}
        anchorWeekIndex={anchorWeekIndex}
        scrollRef={scrollRef}
        isNavigating={isNavigating}
        onDayClick={navigateToDate}
        onEventClick={toggleActiveEventId}
        onScrollMonthChange={setActiveDate}
        draftEvent={draftCalEvent}
      />
    </div>
  )
}
