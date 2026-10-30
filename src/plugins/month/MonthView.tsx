import { useRef } from "react"

import { useEventsInRange, useNavigation } from "@/sdk"

import { MonthGrid } from "./Grid"
import { WeekDayLabels } from "./WeekDayLabels"
import { useInfiniteMonths } from "./useInfiniteMonths"
import { useMonthEventLayout } from "./useMonthEventLayout"
import { useMonthGrid } from "./useMonthGrid"

export function MonthView() {
  const { activeDate } = useNavigation()

  const scrollRef = useRef<HTMLDivElement | null>(null)

  const { rangeStart, rangeEnd, gridStart, gridEnd } = useInfiniteMonths({
    scrollContainerRef: scrollRef,
    activeDate,
  })

  const weeks = useMonthGrid(rangeStart, rangeEnd)
  // Loading follows the rendered weeks and never blocks scrolling.
  const events = useEventsInRange(gridStart, gridEnd)
  const weekLayouts = useMonthEventLayout(weeks, events)

  // Compute initial anchor week (the week containing the 1st of activeDate's month)
  const initialAnchorRef = useRef(activeDate.with({ day: 1 }))
  const anchorWeekIndex = weeks.findIndex((week) =>
    week.some((d) => d.date.equals(initialAnchorRef.current)),
  )

  return (
    <div className="flex flex-col grow w-full h-full">
      <WeekDayLabels />

      <MonthGrid
        weeks={weeks}
        weekLayouts={weekLayouts}
        anchorWeekIndex={anchorWeekIndex}
        scrollRef={scrollRef}
      />
    </div>
  )
}
