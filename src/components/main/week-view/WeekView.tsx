import { useRef } from "react"

import { useAgendaSelection } from "@/contexts/AgendaFocusContext"
import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation, useCalendars } from "@/contexts/CalendarStateContext"

import { useDayRangeLayout } from "@/hooks/cal-events/useDayRangeLayout"
import { useEventsWithDraft } from "@/hooks/cal-events/useEventsWithDraft"
import { useInfiniteDays } from "@/hooks/cal-events/useInfiniteDays"
import { useVisibleCalendarIds } from "@/hooks/cal-events/useVisibleCalendarIds"
import { useIsDimmed } from "@/hooks/useIsDimmed"
import { eventKey } from "@/lib/cal-events"
import { formatDateKey } from "@/lib/event-time"

import { WeekTimeGrid } from "./WeekTimeGrid"

export function WeekView() {
  const { calendars } = useCalendars()
  const { activeDate, navigateToDate } = useCalendarNavigation()
  const { calendarEvents, toggleActiveEventKey, activeEvent } = useCalEvents()
  const { selectedEventKey } = useAgendaSelection()

  const visibleCalendarIds = useVisibleCalendarIds()

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { days } = useInfiniteDays({ scrollContainerRef, activeDate, visibleCalendarIds })
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
        activeEventKey={activeEvent ? eventKey(activeEvent) : null}
        selectedEventKey={selectedEventKey}
        activeDateKey={formatDateKey(activeDate)}
        scrollContainerRef={scrollContainerRef}
        onDayClick={navigateToDate}
        onScrollActiveChange={navigateToDate}
        onEventClick={toggleActiveEventKey}
        draftEvent={draftCalEvent}
        dimmed={dimmed}
      />
    </div>
  )
}
