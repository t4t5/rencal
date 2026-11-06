import { useRef } from "react"

import { useEventsInRange, useNavigation } from "@/sdk"
import { WeekTimeGrid } from "@/views/builtin/week/WeekTimeGrid"
import { useDayRangeLayout } from "@/views/builtin/week/useDayRangeLayout"
import { useDayWidth, useInfiniteDays, type WeekDay } from "@/views/builtin/week/useInfiniteDays"

import { PickedBackground } from "./AvailabilityLayers"
import { AvailabilityPanel } from "./AvailabilityPanel"
import { pickRange, useAvailability } from "./availability-store"
import { usePickDrag } from "./usePickDrag"

/**
 * Pick times to offer someone: a week grid hatched except for your picks, with
 * a panel on the right that turns them into a message.
 */
export function AvailabilityView() {
  const { activeDate } = useNavigation()
  const { days: picked } = useAvailability()

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { dayWidth, measured } = useDayWidth(scrollContainerRef)
  const { origin, startIndex, days, start, end } = useInfiniteDays({
    scrollContainerRef,
    activeDate,
    dayWidth,
  })
  const events = useEventsInRange(start, end)
  const layout = useDayRangeLayout(days, events)

  const { dragging, startDrag } = usePickDrag((day, range) => pickRange(day.date, range))

  const pickedOn = (day: WeekDay) =>
    picked.find((other) => other.date.equals(day.date))?.ranges ?? []
  const draggingOn = (day: WeekDay) => (dragging?.dayKey === day.dateKey ? dragging : null)

  return (
    <div className="flex h-full w-full min-w-0 border-t border-border">
      <div className="relative h-full grow min-w-0">
        <WeekTimeGrid
          origin={origin}
          startIndex={startIndex}
          days={days}
          dayWidth={dayWidth}
          dayWidthMeasured={measured}
          layout={layout}
          scrollContainerRef={scrollContainerRef}
          readOnly
          onDayPointerDown={startDrag}
          dayBackground={(day) => (
            <PickedBackground picked={pickedOn(day)} dragging={draggingOn(day)} />
          )}
        />
      </div>

      <AvailabilityPanel />
    </div>
  )
}
