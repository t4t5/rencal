import { isSameDay, startOfMonth } from "date-fns"
import { useRef } from "react"

import { MonthGrid } from "@/components/main/month-view/Grid"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation, useCalendars } from "@/contexts/CalendarStateContext"

import { useEventsWithDraft } from "@/hooks/cal-events/useEventsWithDraft"
import { useMonthEventLayout } from "@/hooks/cal-events/useMonthEventLayout"
import { useMonthGrid } from "@/hooks/cal-events/useMonthGrid"
import { useIsDimmed } from "@/hooks/useIsDimmed"
import { formatDateKey } from "@/lib/event-time"

import { WeekDayLabels } from "./WeekDayLabels"
import { useInfiniteEvents } from "./useInfiniteEvents"

export function MonthView() {
  const { calendars } = useCalendars()
  const { activeDate, navigateToDate, isNavigating } = useCalendarNavigation()
  const { calendarEvents, toggleActiveEventId, activeEvent } = useCalEvents()

  // TODO: respect calendar visibility
  const visibleCalendarIds = calendars.map((c) => c.slug)

  const scrollRef = useRef<HTMLDivElement | null>(null)

  const { rangeStart, rangeEnd } = useInfiniteEvents({
    scrollContainerRef: scrollRef,
    activeDate,
    visibleCalendarIds,
  })

  const weeks = useMonthGrid(rangeStart, rangeEnd)
  const { events, draftCalEvent } = useEventsWithDraft(calendarEvents)
  const weekLayouts = useMonthEventLayout(weeks, events, calendars)
  const dimmed = useIsDimmed()

  // Compute initial anchor week (the week containing the 1st of activeDate's month)
  const initialAnchorRef = useRef(startOfMonth(activeDate))
  const anchorWeekIndex = weeks.findIndex((week) =>
    week.some((d) => isSameDay(d.date, initialAnchorRef.current)),
  )

  return (
    <div className="flex flex-col grow w-full h-full">
      <WeekDayLabels dimmed={dimmed} />

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
        onScrollMonthChange={navigateToDate}
        draftEvent={draftCalEvent}
        dimmed={dimmed}
      />
    </div>
  )
}
