import { memo } from "react"

import { MonthAllDayEvent } from "@/components/events-blocks/month-view/AllDayEventBlock"
import { MonthDayCell } from "@/components/main/month-view/Cell"

import { useCalendars } from "@/contexts/CalendarStateContext"

import type { WeekLayout } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { isDeclinedEvent, isPendingEvent } from "@/lib/event-utils"

import { TopLeftDate } from "./TopLeftDate"

const MAX_ALL_DAY_LANES = 3
const MONTH_BOUNDARY_COLOR = "color-mix(in srgb, var(--foreground) 28%, var(--background))"
export const LANE_HEIGHT = 20
export const LANE_GAP = 3

function MonthBoundary({ col, showHorizontal = true }: { col: number; showHorizontal?: boolean }) {
  if (col < 0 || (col === 0 && !showHorizontal)) return null

  if (col === 0) {
    return (
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-20 h-0.5"
        style={{ backgroundColor: MONTH_BOUNDARY_COLOR }}
      />
    )
  }

  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 -translate-x-px"
      style={{ left: `${(col / 7) * 100}%`, backgroundColor: MONTH_BOUNDARY_COLOR }}
    />
  )
}

export const MonthWeekRow = memo(function MonthWeekRow({
  weekDays,
  layout,
  activeEventKey,
  selectedEventKey,
  activeDateKey,
  onDayClick,
  onEventClick,
  draftEvent,
  dimmed,
}: {
  weekDays: MonthDay[]
  layout: WeekLayout
  activeEventKey: string | null
  selectedEventKey: string | null
  activeDateKey: string
  onDayClick: (date: Date) => void
  onEventClick: (eventKey: string) => void
  draftEvent: CalendarEvent | null
  dimmed: boolean
}) {
  const { calendars } = useCalendars()

  const allDayEvents = layout.allDayItems.filter((item) => item.lane < MAX_ALL_DAY_LANES)
  const monthStartCol = weekDays.findIndex((day) => day.date.getDate() === 1)

  // Per-column reserved lanes: a day only leaves space for all-day bars that actually span it
  const reservedLanes: number[] = Array(7).fill(0)

  for (const item of allDayEvents) {
    for (let c = item.startCol - 1; c < item.endCol - 1; c++) {
      reservedLanes[c] = Math.max(reservedLanes[c], item.lane + 1)
    }
  }

  return (
    <>
      {/* Day numbers */}
      <div className="grid grid-cols-7 relative">
        {weekDays.map((day) => (
          <TopLeftDate
            key={day.dateKey}
            day={day}
            isActive={day.dateKey === activeDateKey}
            dimmed={dimmed}
            onClick={() => onDayClick(day.date)}
          />
        ))}
        <MonthBoundary col={monthStartCol} />
      </div>

      <div className="grid grid-cols-7 grow min-h-0 relative">
        {/* All-day events */}
        {allDayEvents.map((item) => {
          const key = eventKey(item.event)

          return (
            <MonthAllDayEvent
              key={key}
              item={item}
              highlighted={key === activeEventKey || key === selectedEventKey}
              isPending={isPendingEvent(item.event, calendars)}
              isDeclined={isDeclinedEvent(item.event, calendars)}
              isDraft={item.event === draftEvent}
              dimmed={dimmed}
              onClick={() => onEventClick(key)}
            />
          )
        })}

        {/* Timed events */}
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
              activeEventKey={activeEventKey}
              selectedEventKey={selectedEventKey}
              isActiveDay={day.dateKey === activeDateKey}
              onClick={() => onDayClick(day.date)}
              onEventClick={onEventClick}
              draftEvent={draftEvent}
              dimmed={dimmed}
            />
          )
        })}
        <MonthBoundary col={monthStartCol} showHorizontal={false} />
      </div>
    </>
  )
})
