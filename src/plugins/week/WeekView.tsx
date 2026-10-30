import { useRef } from "react"

import { useEventsInRange, useNavigation } from "@/sdk"

import { WeekTimeGrid } from "./WeekTimeGrid"
import { useDayRangeLayout } from "./useDayRangeLayout"
import { useInfiniteDays } from "./useInfiniteDays"

export function WeekView() {
  const { activeDate } = useNavigation()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { days, start, end } = useInfiniteDays({ scrollContainerRef, activeDate })
  const events = useEventsInRange(start, end)
  const layout = useDayRangeLayout(days, events)

  return (
    <div className="relative h-full w-full min-w-0">
      <WeekTimeGrid
        days={days}
        timedByDay={layout.timedByDay}
        allDayItems={layout.allDayItems}
        maxAllDayLane={layout.maxAllDayLane}
        scrollContainerRef={scrollContainerRef}
      />
    </div>
  )
}
