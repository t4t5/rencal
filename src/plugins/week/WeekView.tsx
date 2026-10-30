import { useRef } from "react"

import { useEventsInRange, useNavigation } from "@/sdk"

import { WeekTimeGrid } from "./WeekTimeGrid"
import { useDayRangeLayout } from "./useDayRangeLayout"
import { useDayWidth, useInfiniteDays } from "./useInfiniteDays"

export function WeekView() {
  const { activeDate } = useNavigation()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { dayWidth, measured } = useDayWidth(scrollContainerRef)
  const { origin, startIndex, days, start, end } = useInfiniteDays({
    scrollContainerRef,
    activeDate,
    dayWidth,
  })
  const events = useEventsInRange(start, end)
  const layout = useDayRangeLayout(days, events)

  return (
    <div className="relative h-full w-full min-w-0">
      <WeekTimeGrid
        origin={origin}
        startIndex={startIndex}
        days={days}
        dayWidth={dayWidth}
        dayWidthMeasured={measured}
        timedByDay={layout.timedByDay}
        allDayItems={layout.allDayItems}
        maxAllDayLane={layout.maxAllDayLane}
        scrollContainerRef={scrollContainerRef}
      />
    </div>
  )
}
