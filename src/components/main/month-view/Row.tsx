import { memo } from "react"

import { MonthAllDayEvent } from "@/components/events-blocks/month-view/AllDayEventBlock"
import { MonthDayCell } from "@/components/main/month-view/Cell"

import { useCalendars } from "@/contexts/CalendarStateContext"

import type { WeekLayout } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import type { CalendarEvent } from "@/lib/cal-events"
import { isDeclinedEvent, isPendingEvent } from "@/lib/event-utils"

import { TopLeftDate } from "./TopLeftDate"

const MAX_ALL_DAY_LANES = 3
const LANE_HEIGHT = 20
const LANE_GAP = 3

export const MonthWeekRow = memo(function MonthWeekRow({
  weekDays,
  layout,
  activeEventId,
  activeDateKey,
  onDayClick,
  onEventClick,
  draftEvent,
  dimmed,
}: {
  weekDays: MonthDay[]
  layout: WeekLayout
  activeEventId: string | null
  activeDateKey: string
  onDayClick: (date: Date) => void
  onEventClick: (eventId: string) => void
  draftEvent: CalendarEvent | null
  dimmed: boolean
}) {
  const { calendars } = useCalendars()
  const visibleAllDay = layout.allDayItems.filter((item) => item.lane < MAX_ALL_DAY_LANES)

  // Per-column reserved lanes: a day only leaves space for all-day bars that actually span it
  const reservedLanes = Array(7).fill(0) as number[]

  for (const item of visibleAllDay) {
    for (let c = item.startCol - 1; c < item.endCol - 1; c++) {
      reservedLanes[c] = Math.max(reservedLanes[c], item.lane + 1)
    }
  }

  return (
    <>
      {/* Day numbers row */}
      <div className="grid grid-cols-7">
        {weekDays.map((day) => (
          <TopLeftDate
            key={day.dateKey}
            day={day}
            isActive={day.dateKey === activeDateKey}
            dimmed={dimmed}
            onClick={() => onDayClick(day.date)}
          />
        ))}
      </div>

      {/* Day cells with all-day bars overlaid */}
      <div className="grid grid-cols-7 grow min-h-0 relative">
        {weekDays.map((day, colIndex) => {
          const allDayOnDay = layout.allDayItems.filter(
            (item) => item.startCol <= colIndex + 1 && item.endCol > colIndex + 1,
          )
          const visibleAllDayOnDay = allDayOnDay.filter((item) => item.lane < MAX_ALL_DAY_LANES)
          const hiddenAllDay = allDayOnDay.length - visibleAllDayOnDay.length

          return (
            <MonthDayCell
              key={day.dateKey}
              day={day}
              timedEvents={layout.timedByCol[colIndex]}
              hiddenAllDayCount={hiddenAllDay}
              reservedAllDayHeight={
                reservedLanes[colIndex] > 0 ? reservedLanes[colIndex] * LANE_HEIGHT - LANE_GAP : 0
              }
              activeEventId={activeEventId}
              isActiveDay={day.dateKey === activeDateKey}
              onClick={() => onDayClick(day.date)}
              onEventClick={onEventClick}
              draftEvent={draftEvent}
              dimmed={dimmed}
            />
          )
        })}

        {visibleAllDay.map((item) => (
          <MonthAllDayEvent
            key={item.event.id}
            item={item}
            isActive={item.event.id === activeEventId}
            isPending={isPendingEvent(item.event, calendars)}
            isDeclined={isDeclinedEvent(item.event, calendars)}
            isDraft={item.event === draftEvent}
            dimmed={dimmed}
            onClick={() => onEventClick(item.event.id)}
          />
        ))}
      </div>
    </>
  )
})
