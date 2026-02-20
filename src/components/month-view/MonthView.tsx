import { addMonths, isSameDay, startOfMonth, subMonths } from "date-fns"
import { useCallback, useLayoutEffect, useRef, useState } from "react"

import { MonthGrid } from "@/components/month-view/MonthGrid"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"

import { useCalEventsInfiniteScroll } from "@/hooks/cal-events/useCalEventsInfiniteScroll"
import { useMonthEventLayout } from "@/hooks/cal-events/useMonthEventLayout"
import { useMonthGrid } from "@/hooks/cal-events/useMonthGrid"
import { useScrollBoundary } from "@/hooks/useScrollBoundary"
import { cn } from "@/lib/utils"

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function MonthView() {
  const { activeDate, setActiveDate, calendars, navigateToDate } = useCalendarState()
  const { calendarEvents, setActiveEventId, activeEvent } = useCalEvents()

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const isScrollUpdate = useRef(false)

  // Range of months to generate weeks for (only grows, never shrinks)
  const [rangeStart, setRangeStart] = useState(() => startOfMonth(subMonths(activeDate, 2)))
  const [rangeEnd, setRangeEnd] = useState(() => startOfMonth(addMonths(activeDate, 3)))

  // For scroll position preservation when prepending weeks
  const prevScrollHeightRef = useRef(0)
  const shouldAdjustScroll = useRef(false)

  const weeks = useMonthGrid(rangeStart, rangeEnd)
  const weekLayouts = useMonthEventLayout(weeks, calendarEvents, calendars)

  // Compute initial anchor week (the week containing the 1st of activeDate's month)
  const initialAnchorRef = useRef(startOfMonth(activeDate))
  const anchorWeekIndex = weeks.findIndex((week) =>
    week.some((d) => isSameDay(d.date, initialAnchorRef.current)),
  )

  // Load more events when scrolling near edges
  useCalEventsInfiniteScroll({ scrollContainerRef: scrollRef })

  // Extend the grid when scrolling near edges
  useScrollBoundary({
    scrollContainerRef: scrollRef,
    threshold: 200,
    onNearTop: useCallback(() => {
      if (scrollRef.current) {
        prevScrollHeightRef.current = scrollRef.current.scrollHeight
        shouldAdjustScroll.current = true
      }
      setRangeStart((prev) => startOfMonth(subMonths(prev, 2)))
    }, []),
    onNearBottom: useCallback(() => {
      setRangeEnd((prev) => startOfMonth(addMonths(prev, 2)))
    }, []),
  })

  // After prepending weeks, adjust scroll position to maintain visual position
  useLayoutEffect(() => {
    if (shouldAdjustScroll.current && scrollRef.current) {
      const diff = scrollRef.current.scrollHeight - prevScrollHeightRef.current
      scrollRef.current.scrollTop += diff
      shouldAdjustScroll.current = false
    }
  })

  const handleScrollDateChange = useCallback(
    (date: Date) => {
      isScrollUpdate.current = true
      setActiveDate(date)
    },
    [setActiveDate],
  )

  return (
    <div className="hidden lg:flex flex-col grow border-l border-l-border min-w-0">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={cn(
              "text-xs text-muted-foreground py-2 text-center font-medium",
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
        anchorWeekIndex={anchorWeekIndex}
        scrollRef={scrollRef}
        onDayClick={navigateToDate}
        onEventClick={setActiveEventId}
        onScrollDateChange={handleScrollDateChange}
      />
    </div>
  )
}
