import { useEffect, useRef } from "react"

import { WeekTimeGrid } from "@/components/main/week-view/WeekTimeGrid"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation, useCalendars } from "@/contexts/CalendarStateContext"

import { useDayRangeLayout } from "@/hooks/cal-events/useDayRangeLayout"
import { useInfiniteDays } from "@/hooks/cal-events/useInfiniteDays"
import { getPreviousCalendarView, useCalendarView } from "@/hooks/useCalendarView"
import { useViewerTzid } from "@/hooks/useViewerTzid"
import type { AvailabilitySource } from "@/lib/api"
import { formatDateKey } from "@/lib/event-time"

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

const FALLBACK_VIEW_ID = "week"

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
  const { calendars } = useCalendars()
  const { activeDate, navigateToDate } = useCalendarNavigation()
  const { calendarEvents } = useCalEvents()
  const { mode, editor, dirty, selections, addSelection, hoveredSelection } = useAvailability()
  const tzid = useViewerTzid()

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { days } = useInfiniteDays({ scrollContainerRef, activeDate })
  const layout = useDayRangeLayout(days, calendarEvents, calendars)

  const hoursValid =
    editor !== null &&
    !(editor.details?.hours_editable !== false && invalidRange(editor.draft.hours))
  const scheduleSourceOrNull: AvailabilitySource | null =
    mode === "schedules" && editor && hoursValid ? scheduleSource(editor, dirty) : null
  const shareSource: AvailabilitySource | null =
    mode === "share" ? { kind: "ranges", ranges: [...selections], tzid } : null
  const schedule = useAvailabilityPreview(scheduleSourceOrNull, days)
  const share = useAvailabilityPreview(shareSource, days)

  const { dragging, startDrag } = useShareDrag(scrollContainerRef, tzid, addSelection)
  const draggingRef = useRef(dragging)
  draggingRef.current = dragging
  useBackOnEscape(draggingRef)

  const scheduleLayers = mode === "schedules" && editor ? { preview: schedule.preview, tzid } : null

  return (
    <div className="flex h-full w-full min-w-0">
      <div className="relative h-full grow min-w-0">
        <WeekTimeGrid
          days={days}
          timedByDay={layout.timedByDay}
          allDayItems={layout.allDayItems}
          maxAllDayLane={layout.maxAllDayLane}
          activeEventKey={null}
          selectedEventKey={null}
          activeDateKey={formatDateKey(activeDate)}
          scrollContainerRef={scrollContainerRef}
          onDayClick={navigateToDate}
          onEventClick={() => {}}
          draftEvent={null}
          dimmed={false}
          eventsInteractive={false}
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

/**
 * Esc returns to the view you came from, once nothing inside wants it: open
 * popovers and selects handle it first, a focused input blurs, and a dirty
 * draft asks through the leave guard.
 */
function useBackOnEscape(draggingRef: { current: unknown }) {
  const { setCalendarView } = useCalendarView()
  const setViewRef = useRef(setCalendarView)
  setViewRef.current = setCalendarView

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || draggingRef.current) return
      const active = document.activeElement
      if (
        active instanceof HTMLElement &&
        active.matches("input, textarea, select, [contenteditable='true']")
      ) {
        active.blur()
        return
      }
      if (document.querySelector("[role='dialog'], [data-radix-popper-content-wrapper]")) return
      event.preventDefault()
      setViewRef.current(getPreviousCalendarView() ?? FALLBACK_VIEW_ID)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [draggingRef])
}
