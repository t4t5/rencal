import { useRef } from "react"

import { useEventsInRange, useNavigation } from "@/sdk"

import { WeekTimeGrid } from "./WeekTimeGrid"
import { useDayRangeLayout } from "./useDayRangeLayout"
import { type Span, useDayWidth, useInfiniteDays } from "./useInfiniteDays"

export function WeekView() {
  return <TimeGridView span="week" />
}

/** The week view's strip, one day wide. It lives here because it is the same view at another width. */
export function DayView() {
  return <TimeGridView span="day" />
}

function TimeGridView({ span }: { span: Span }) {
  const { activeDate } = useNavigation()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { dayWidth, measured } = useDayWidth(scrollContainerRef, span)
  const { origin, startIndex, days, start, end } = useInfiniteDays({
    scrollContainerRef,
    activeDate,
    dayWidth,
    span,
  })
  const events = useEventsInRange(start, end)
  const layout = useDayRangeLayout(days, events)

  return (
    <div className="relative h-full w-full min-w-0">
      <WeekTimeGrid
        span={span}
        origin={origin}
        startIndex={startIndex}
        days={days}
        dayWidth={dayWidth}
        dayWidthMeasured={measured}
        layout={layout}
        scrollContainerRef={scrollContainerRef}
      />
    </div>
  )
}
