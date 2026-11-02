import { Temporal } from "@js-temporal/polyfill"
import { memo } from "react"

import {
  type AllDayBar,
  type CalendarEvent,
  type DayRange,
  isoWeekNumber,
  layoutAllDay,
  useDisplaySettings,
} from "@/sdk"

import { MonthAllDayEvent } from "./AllDayEventBlock"
import { MonthDayCell } from "./Cell"
import { MonthDragToCreateSelection } from "./DragToCreateSelection"
import { TopLeftDate } from "./TopLeftDate"
import { reservedAllDayHeight } from "./lane-geometry"
import type { WeekLayout } from "./useMonthEventLayout"
import type { MonthDay } from "./useMonthGrid"

const MAX_ALL_DAY_LANES = 3

const isEventBar = (bar: AllDayBar<CalendarEvent | DayRange>): bar is AllDayBar<CalendarEvent> =>
  "key" in bar.item

function MonthBoundary({ col, showHorizontal = true }: { col: number; showHorizontal?: boolean }) {
  if (col < 0 || (col === 0 && !showHorizontal)) return null

  if (col === 0) {
    return (
      <div
        data-slot="month-boundary"
        data-orientation="horizontal"
        className="pointer-events-none absolute -top-px left-0 right-0 z-20 h-[3px]"
      />
    )
  }

  return (
    <div
      data-slot="month-boundary"
      data-orientation="vertical"
      className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 -translate-x-px"
      style={{ left: `${(col / 7) * 100}%` }}
    />
  )
}

export const MonthWeekRow = memo(function MonthWeekRow({
  weekDays,
  layout,
  activeDateKey,
  onDayClick,
  createSelection,
}: {
  weekDays: MonthDay[]
  layout: WeekLayout
  activeDateKey: string
  onDayClick: (date: Temporal.PlainDate) => void
  /** The part of the days being drawn to create an event that falls in this week. */
  createSelection: DayRange | null
}) {
  const { showWeekNumbers, firstDayOfWeek } = useDisplaySettings()

  // Pack the selection exactly where the draft event will be packed on release.
  const bars: AllDayBar<CalendarEvent | DayRange>[] = createSelection
    ? layoutAllDay([...layout.allDayEvents, createSelection], weekDays[0].date, 7).bars
    : layout.allDayBars
  const visibleBars = bars.filter((bar) => bar.lane < MAX_ALL_DAY_LANES)
  const hiddenBars = bars
    .filter((bar) => bar.lane >= MAX_ALL_DAY_LANES)
    .filter(isEventBar)
    .sort((a, b) => a.lane - b.lane)
  const selectionBar = visibleBars.find((bar) => !isEventBar(bar))
  const monthStartCol = weekDays.findIndex((day) => day.date.day === 1)

  // Per-column reserved lanes: a day only leaves space for all-day bars that actually span it
  const reservedLanes: number[] = Array(7).fill(0)

  for (const bar of visibleBars) {
    for (let c = bar.column; c < bar.column + bar.span; c++) {
      reservedLanes[c] = Math.max(reservedLanes[c], bar.lane + 1)
    }
  }

  return (
    <>
      {/* Day numbers */}
      <div className="grid grid-cols-7 relative">
        {/* Before the cells, so the last day header stays :last-child */}
        {showWeekNumbers && weekDays[0] && (
          <span
            data-typography="numerical"
            className="pointer-events-none absolute left-1 top-1 z-10 text-2xs leading-[18px] text-muted-foreground select-none"
          >
            {isoWeekNumber(weekDays[0].date, firstDayOfWeek)}
          </span>
        )}
        <MonthBoundary col={monthStartCol} />

        {weekDays.map((day) => (
          <TopLeftDate
            key={day.dateKey}
            day={day}
            isActive={day.dateKey === activeDateKey}
            onClick={() => onDayClick(day.date)}
          />
        ))}
      </div>

      <div className="grid grid-cols-7 grow min-h-0 relative">
        {/* Before the cells, so the last day cell stays :last-child */}
        <MonthBoundary col={monthStartCol} showHorizontal={false} />

        {/* All-day events */}
        {visibleBars.filter(isEventBar).map((bar) => (
          <MonthAllDayEvent key={bar.item.key} bar={bar} />
        ))}

        {selectionBar && <MonthDragToCreateSelection bar={selectionBar} />}

        {/* Timed events */}
        {weekDays.map((day, colIndex) => {
          const hiddenAllDay = hiddenBars
            .filter((bar) => bar.column <= colIndex && colIndex < bar.column + bar.span)
            .map((bar) => bar.item)

          return (
            <MonthDayCell
              key={day.dateKey}
              day={day}
              timedEvents={layout.timedByCol[colIndex]}
              hiddenAllDayEvents={hiddenAllDay}
              reservedAllDayHeight={reservedAllDayHeight(reservedLanes[colIndex])}
              isActiveDay={day.dateKey === activeDateKey}
              onClick={() => onDayClick(day.date)}
            />
          )
        })}
      </div>
    </>
  )
})
