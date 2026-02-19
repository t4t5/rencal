import { differenceInMonths, startOfMonth } from "date-fns"
import { useCallback, useEffect, useRef, useState } from "react"

import { MonthGrid } from "@/components/month-view/MonthGrid"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"

import { useMonthEventLayout } from "@/hooks/cal-events/useMonthEventLayout"
import { useMonthGrid } from "@/hooks/cal-events/useMonthGrid"
import { cn } from "@/lib/utils"

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function MonthView() {
  const { activeDate, setActiveDate, calendars, navigateToDate } = useCalendarState()
  const { calendarEvents, setActiveEventId, activeEvent } = useCalEvents()

  // gridAnchor controls which months are generated - only changes on explicit navigation
  const [gridAnchor, setGridAnchor] = useState(() => startOfMonth(activeDate))
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const isScrollUpdate = useRef(false)

  const { weeks, anchorWeekIndex } = useMonthGrid(gridAnchor)
  const weekLayouts = useMonthEventLayout(weeks, calendarEvents, calendars)

  // When activeDate changes externally (not from scroll), re-anchor if needed
  useEffect(() => {
    if (isScrollUpdate.current) {
      isScrollUpdate.current = false
      return
    }

    const monthDiff = Math.abs(differenceInMonths(startOfMonth(activeDate), gridAnchor))
    if (monthDiff >= 2) {
      setGridAnchor(startOfMonth(activeDate))
    }
  }, [activeDate, gridAnchor])

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
        onDayClick={(date) => navigateToDate(date)}
        onEventClick={(eventId) => setActiveEventId(eventId)}
        onScrollDateChange={handleScrollDateChange}
      />
    </div>
  )
}
