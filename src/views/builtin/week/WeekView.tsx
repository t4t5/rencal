import { useRef } from "react"

import { TimeZoneDivider, useTimeZoneGutter, useEventsInRange, useNavigation } from "@/sdk"

import { WeekTimeGrid } from "./WeekTimeGrid"
import { useDayRangeLayout } from "./useDayRangeLayout"
import { useGutterZones } from "./useGutterZones"
import {
  DAY_WIDTH_MIN,
  dayColumnWidth,
  type Span,
  useViewportWidth,
  useInfiniteDays,
} from "./useInfiniteDays"

/** Displays a full week on the shared time grid. */
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
  const zones = useGutterZones()
  const viewport = useViewportWidth(scrollContainerRef)
  const gutter = useTimeZoneGutter(zones.length, viewport ?? Infinity, DAY_WIDTH_MIN)
  const gutterWidth = gutter.width
  const dayWidth = viewport === null ? 180 : dayColumnWidth(viewport, gutterWidth, span)
  const { origin, startIndex, days, start, end } = useInfiniteDays({
    scrollContainerRef,
    activeDate,
    dayWidth,
    gutterWidth,
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
        dayWidthMeasured={viewport !== null}
        gutterWidth={gutterWidth}
        zones={zones}
        layout={layout}
        scrollContainerRef={scrollContainerRef}
      />
      <TimeZoneDivider {...gutter} />
    </div>
  )
}
