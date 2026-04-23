import { useRef } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation, useCalendars } from "@/contexts/CalendarStateContext"

import { useDayRangeLayout } from "@/hooks/cal-events/useDayRangeLayout"
import { useEventsWithDraft } from "@/hooks/cal-events/useEventsWithDraft"
import { useInfiniteDays } from "@/hooks/cal-events/useInfiniteDays"
import { useIsDimmed } from "@/hooks/useIsDimmed"
import { formatDateKey } from "@/lib/time"

import { WeekTimeGrid } from "./WeekTimeGrid"

export function WeekView() {
  const { calendars } = useCalendars()
  const { activeDate, navigateToDate, setActiveDate } = useCalendarNavigation()
  const { calendarEvents, toggleActiveEventId, activeEvent } = useCalEvents()

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { days } = useInfiniteDays({ scrollContainerRef, activeDate })
  const { events, draftCalEvent } = useEventsWithDraft(calendarEvents)
  const layout = useDayRangeLayout(days, events, calendars)
  const dimmed = useIsDimmed()

  return (
    <div className="relative h-full w-full min-w-0">
      <WeekTimeGrid
        days={days}
        timedByDay={layout.timedByDay}
        allDayItems={layout.allDayItems}
        maxAllDayLane={layout.maxAllDayLane}
        activeEventId={activeEvent?.id ?? null}
        activeDateKey={formatDateKey(activeDate)}
        scrollContainerRef={scrollContainerRef}
        onDayClick={navigateToDate}
        onScrollActiveChange={setActiveDate}
        onEventClick={toggleActiveEventId}
        draftEvent={draftCalEvent}
        dimmed={dimmed}
      />
    </div>
  )
}
