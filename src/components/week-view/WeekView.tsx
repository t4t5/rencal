import { format, startOfWeek } from "date-fns"
import { useRef } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"

import { useWeekDays } from "@/hooks/cal-events/useWeekDays"
import { useWeekEventLayout } from "@/hooks/cal-events/useWeekEventLayout"

import { WeekTimeGrid } from "./WeekTimeGrid"

export function WeekView() {
  const { activeDate, calendars } = useCalendarState()
  const { calendarEvents, toggleActiveEventId, activeEvent } = useCalEvents()

  const weekStart = startOfWeek(activeDate, { weekStartsOn: 1 })
  const weekKey = format(weekStart, "yyyy-MM-dd")

  const weekDays = useWeekDays(activeDate)
  const layout = useWeekEventLayout(weekDays, calendarEvents, calendars)

  // Track direction for animation
  const prevWeekKeyRef = useRef(weekKey)
  const directionRef = useRef(0)

  if (prevWeekKeyRef.current !== weekKey) {
    directionRef.current = weekKey > prevWeekKeyRef.current ? 1 : -1
    prevWeekKeyRef.current = weekKey
  }

  const direction = directionRef.current

  return (
    <div className="relative h-full overflow-hidden">
      <WeekTimeGrid
        weekDays={weekDays}
        timedByCol={layout.timedByCol}
        allDayItems={layout.allDayItems}
        maxAllDayLane={layout.maxAllDayLane}
        activeEventId={activeEvent?.id ?? null}
        activeDateKey={format(activeDate, "yyyy-MM-dd")}
        onEventClick={toggleActiveEventId}
        visibleStartHour={layout.visibleStartHour}
        visibleEndHour={layout.visibleEndHour}
      />
    </div>
  )
}
