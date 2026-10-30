import { Temporal } from "@js-temporal/polyfill"
import { memo, type PointerEvent as ReactPointerEvent } from "react"

import { type AllDaySpan, assignAllDayLanes, isoWeekNumber, useDisplaySettings } from "@/sdk"

import { MonthAllDayEvent } from "./AllDayEventBlock"
import { MonthDayCell } from "./Cell"
import { MonthDragToCreateSelection } from "./DragToCreateSelection"
import { TopLeftDate } from "./TopLeftDate"
import { reservedAllDayHeight } from "./lane-geometry"
import type { WeekLayout } from "./useMonthEventLayout"
import type { MonthDay } from "./useMonthGrid"

const MAX_ALL_DAY_LANES = 3

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
  startCreateDrag,
}: {
  weekDays: MonthDay[]
  layout: WeekLayout
  activeDateKey: string
  onDayClick: (date: Temporal.PlainDate) => void
  createSelection: AllDaySpan | null
  startCreateDrag: (day: Temporal.PlainDate, event: ReactPointerEvent<HTMLElement>) => void
}) {
  const { showWeekNumbers, firstDayOfWeek } = useDisplaySettings()

  // Pack the temporary selection exactly where the appended draft event will
  // be packed on release. Clone real items because lane assignment mutates.
  const packedAllDayEvents = createSelection
    ? layout.allDayItems.map((item) => ({ ...item }))
    : layout.allDayItems
  const packedCreateSelection = createSelection ? { ...createSelection, lane: 0 } : null
  const packedLaneItems = packedCreateSelection
    ? [...packedAllDayEvents, packedCreateSelection]
    : packedAllDayEvents
  if (packedCreateSelection) {
    assignAllDayLanes(packedLaneItems, 7)
  }

  const allDayEvents = packedAllDayEvents.filter((item) => item.lane < MAX_ALL_DAY_LANES)
  const visibleCreateSelection =
    packedCreateSelection && packedCreateSelection.lane < MAX_ALL_DAY_LANES
      ? packedCreateSelection
      : null
  const monthStartCol = weekDays.findIndex((day) => day.date.day === 1)

  // Per-column reserved lanes: a day only leaves space for all-day bars that actually span it
  const reservedLanes: number[] = Array(7).fill(0)

  for (const item of packedLaneItems.filter((item) => item.lane < MAX_ALL_DAY_LANES)) {
    for (let c = item.startCol - 1; c < item.endCol - 1; c++) {
      reservedLanes[c] = Math.max(reservedLanes[c], item.lane + 1)
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
            startCreateDrag={startCreateDrag}
          />
        ))}
      </div>

      <div className="grid grid-cols-7 grow min-h-0 relative">
        {/* Before the cells, so the last day cell stays :last-child */}
        <MonthBoundary col={monthStartCol} showHorizontal={false} />

        {/* All-day events */}
        {allDayEvents.map((item) => (
          <MonthAllDayEvent key={item.event.key} item={item} />
        ))}

        {visibleCreateSelection && (
          <MonthDragToCreateSelection
            span={visibleCreateSelection}
            lane={visibleCreateSelection.lane}
          />
        )}

        {/* Timed events */}
        {weekDays.map((day, colIndex) => {
          const hiddenAllDay = packedAllDayEvents
            .filter(
              (item) =>
                item.lane >= MAX_ALL_DAY_LANES &&
                item.startCol <= colIndex + 1 &&
                item.endCol > colIndex + 1,
            )
            .sort((a, b) => a.lane - b.lane)

          return (
            <MonthDayCell
              key={day.dateKey}
              day={day}
              timedEvents={layout.timedByCol[colIndex]}
              hiddenAllDayItems={hiddenAllDay}
              reservedAllDayHeight={reservedAllDayHeight(reservedLanes[colIndex])}
              isActiveDay={day.dateKey === activeDateKey}
              onClick={() => onDayClick(day.date)}
              startCreateDrag={startCreateDrag}
            />
          )
        })}
      </div>
    </>
  )
})
