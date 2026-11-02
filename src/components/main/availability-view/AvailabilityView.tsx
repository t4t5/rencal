import { useRef } from "react"

import { useViewerTzid } from "@/hooks/useViewerTzid"
import type { AvailabilitySource } from "@/lib/api"

import { useEventsInRange, useNavigation } from "@/sdk"
import { WeekTimeGrid } from "@/views/builtin/week/WeekTimeGrid"
import { useDayRangeLayout } from "@/views/builtin/week/useDayRangeLayout"
import { useDayWidth, useInfiniteDays } from "@/views/builtin/week/useInfiniteDays"

import { AvailabilityProvider, useAvailability } from "./AvailabilityContext"
import {
  ScheduleBackground,
  ScheduleOverlay,
  ShareBackground,
  ShareOverlay,
} from "./AvailabilityLayers"
import { AvailabilityPanel } from "./AvailabilityPanel"
import { scheduleSource } from "./SchedulesPanel"
import { invalidRange } from "./hours-reducer"
import { useAvailabilityPreview } from "./useAvailabilityPreview"
import { useShareDrag } from "./useShareDrag"

/**
 * Create, edit, preview and share availabilities: a week grid that shows what
 * someone booking would get, with an inspector panel on the right.
 */
export function AvailabilityView() {
  return (
    <AvailabilityProvider>
      <AvailabilityViewContent />
    </AvailabilityProvider>
  )
}

function AvailabilityViewContent() {
  const { activeDate } = useNavigation()
  const { mode, editor, dirty, selections, addSelection, hoveredSelection } = useAvailability()
  const tzid = useViewerTzid()

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { dayWidth, measured } = useDayWidth(scrollContainerRef)
  const { origin, startIndex, days, start, end } = useInfiniteDays({
    scrollContainerRef,
    activeDate,
    dayWidth,
  })
  const events = useEventsInRange(start, end)
  const layout = useDayRangeLayout(days, events)

  const hoursValid =
    editor !== null &&
    !(editor.details?.hours_editable !== false && invalidRange(editor.draft.hours))
  const scheduleSourceOrNull: AvailabilitySource | null =
    mode === "schedules" && editor && hoursValid ? scheduleSource(editor, dirty) : null
  const shareSource: AvailabilitySource | null =
    mode === "share" ? { kind: "ranges", ranges: [...selections], tzid } : null
  const schedule = useAvailabilityPreview(scheduleSourceOrNull, days)
  const share = useAvailabilityPreview(shareSource, days)

  const { dragging, startDrag } = useShareDrag(tzid, addSelection)

  const scheduleLayers = mode === "schedules" && editor ? { preview: schedule.preview, tzid } : null

  return (
    <div className="flex h-full w-full min-w-0">
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
          onDayPointerDown={mode === "share" ? startDrag : undefined}
          dayBackground={
            scheduleLayers
              ? (day) => <ScheduleBackground day={day} {...scheduleLayers} />
              : mode === "share"
                ? (day) => (
                    <ShareBackground
                      day={day}
                      selections={selections}
                      tzid={tzid}
                      dragging={dragging?.dayKey === day.dateKey ? dragging : null}
                    />
                  )
                : undefined
          }
          dayOverlay={
            scheduleLayers
              ? (day) => <ScheduleOverlay day={day} {...scheduleLayers} />
              : mode === "share"
                ? (day) => (
                    <ShareOverlay
                      day={day}
                      hovered={hoveredSelection}
                      busy={share.preview?.busy ?? []}
                      tzid={tzid}
                      dragging={dragging?.dayKey === day.dateKey ? dragging : null}
                    />
                  )
                : undefined
          }
        />
        {mode === "schedules" && schedule.error && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 rounded-md bg-popover px-3 py-1.5 text-sm text-destructive shadow">
            {schedule.error}
          </div>
        )}
      </div>

      <AvailabilityPanel />
    </div>
  )
}
