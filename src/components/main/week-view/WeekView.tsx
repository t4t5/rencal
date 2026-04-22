import { startOfWeek } from "date-fns"
import { useRef } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation, useCalendars } from "@/contexts/CalendarStateContext"

import { useEventsWithDraft } from "@/hooks/cal-events/useEventsWithDraft"
import { useWeekDays } from "@/hooks/cal-events/useWeekDays"
import { useWeekEventLayout } from "@/hooks/cal-events/useWeekEventLayout"
import { useIsDimmed } from "@/hooks/useIsDimmed"
import { formatDateKey } from "@/lib/time"

import { WeekTimeGrid } from "./WeekTimeGrid"

export function WeekView() {
  const { calendars } = useCalendars()
  const { activeDate, navigateToDate } = useCalendarNavigation()
  const { calendarEvents, toggleActiveEventId, activeEvent } = useCalEvents()

  const weekStart = startOfWeek(activeDate, { weekStartsOn: 1 })
  const weekKey = formatDateKey(weekStart)

  const weekDays = useWeekDays(activeDate)
  const { events, draftCalEvent } = useEventsWithDraft(calendarEvents)
  const layout = useWeekEventLayout(weekDays, events, calendars)
  const dimmed = useIsDimmed()

  // Track direction for animation
  const prevWeekKeyRef = useRef(weekKey)
  const directionRef = useRef(0)

  if (prevWeekKeyRef.current !== weekKey) {
    directionRef.current = weekKey > prevWeekKeyRef.current ? 1 : -1
    prevWeekKeyRef.current = weekKey
  }

  return (
    <div className="relative h-full">
      <WeekTimeGrid
        weekDays={weekDays}
        timedByCol={layout.timedByCol}
        allDayItems={layout.allDayItems}
        maxAllDayLane={layout.maxAllDayLane}
        activeEventId={activeEvent?.id ?? null}
        activeDateKey={formatDateKey(activeDate)}
        onDayClick={navigateToDate}
        onEventClick={toggleActiveEventId}
        draftEvent={draftCalEvent}
        dimmed={dimmed}
      />
    </div>
  )
}
