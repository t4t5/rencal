import { useRef } from "react"

import { useEventsInRange, useNavigation } from "@/sdk"

import { MonthGrid } from "./Grid"
import { WeekDayLabels } from "./WeekDayLabels"
import { useInfiniteMonths, useRowHeight } from "./useInfiniteMonths"
import { useMonthEventLayout } from "./useMonthEventLayout"
import { useMonthGrid } from "./useMonthGrid"

export function MonthView() {
  const { activeDate } = useNavigation()

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const rowHeight = useRowHeight(scrollRef)

  const { origin, startIndex, endIndex, start, end } = useInfiniteMonths({
    scrollContainerRef: scrollRef,
    activeDate,
    rowHeight,
  })

  const weeks = useMonthGrid(origin, startIndex, endIndex)
  // Loading follows the loaded weeks and never blocks scrolling.
  const events = useEventsInRange(start, end)
  const weekLayouts = useMonthEventLayout(weeks, events)

  return (
    <div className="flex flex-col grow w-full h-full">
      <WeekDayLabels />

      <MonthGrid
        origin={origin}
        startIndex={startIndex}
        weeks={weeks}
        weekLayouts={weekLayouts}
        rowHeight={rowHeight}
        scrollRef={scrollRef}
      />
    </div>
  )
}
