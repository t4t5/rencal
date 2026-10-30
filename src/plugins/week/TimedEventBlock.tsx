import { memo } from "react"

import {
  cn,
  formatTime,
  Tooltip,
  UntitledEventText,
  useDisplaySettings,
  useEventProps,
  useEventState,
} from "@/sdk"

import { overlapBox, weekEventBox } from "./grid"
import type { WeekTimedEventLayout } from "./useDayRangeLayout"

function WeekTimedEventImpl({ layout }: { layout: WeekTimedEventLayout }) {
  const { event } = layout
  const { timeFormat } = useDisplaySettings()
  // The floating copy keeps this block's size so it reads as the block being lifted.
  const eventProps = useEventProps(event, { drag: "block" })
  const { draft, drag, menuOpen } = useEventState(event)

  const mode = layout.displayMode
  const isDashed = event.rsvp === "needs-action" || event.rsvp === "declined"
  const hasStripe = !isDashed && !draft

  const summary = event.summary || <UntitledEventText />
  const startTime = formatTime(event.start, timeFormat)
  const endTime = formatTime(event.end, timeFormat)

  return (
    <Tooltip
      side="right"
      className="max-w-64 flex-col items-start gap-0.5"
      // Stay out of the way while the event is being dragged or its menu is open.
      disabled={draft || drag !== null || menuOpen}
      content={
        <>
          <span className="font-medium wrap-break-word">{summary}</span>
          <span>
            {startTime} – {endTime}
          </span>
          {event.location && <span className="wrap-break-word">{event.location}</span>}
        </>
      }
    >
      <div
        {...eventProps}
        data-view="week"
        className={cn(
          "absolute overflow-hidden rounded-sm px-(--event-padding-inline) text-xs cursor-default",
          hasStripe && "pl-[calc(var(--event-padding-inline)+4px)]",
        )}
        style={{
          ...weekEventBox(layout.top, layout.height),
          ...overlapBox(layout),
          // Overlaps paint in layout order; lift the preview above them so its ring stays visible.
          zIndex: drag === "preview" ? 10 : undefined,
          ...eventProps.style,
        }}
      >
        {hasStripe && (
          <div
            data-slot="calendar-event-color-marker"
            className="absolute left-0 top-0 bottom-0 w-1"
          />
        )}

        {mode === "xs" ? (
          <div className="flex items-baseline gap-1 pt-px">
            {/* Title + time on one line */}
            <span
              data-slot="calendar-event-title"
              className="truncate font-medium leading-tight min-w-0 flex-1"
            >
              {summary}
            </span>
            <span data-slot="calendar-event-time" className="text-2xs shrink-0 leading-tight">
              {startTime}
            </span>
          </div>
        ) : mode === "sm" ? (
          <div className="pt-0.5">
            {/* Title + time on separate lines, minimal padding */}
            <div data-slot="calendar-event-title" className="truncate font-medium leading-tight">
              {summary}
            </div>
            <div data-slot="calendar-event-time" className="truncate leading-tight">
              {startTime} - {endTime}
            </div>
          </div>
        ) : mode === "md" ? (
          <div className="py-1">
            {/* Title + time on separate lines, with padding */}
            <div data-slot="calendar-event-title" className="font-medium leading-tight">
              {summary}
            </div>
            <div data-slot="calendar-event-time" className="truncate leading-tight">
              {startTime} – {endTime}
            </div>
          </div>
        ) : (
          <div className="py-1">
            {/* Title = 2 lines, time = 1 line, with padding */}
            <div
              data-slot="calendar-event-title"
              className="font-medium leading-tight line-clamp-2"
            >
              {summary}
            </div>
            <div data-slot="calendar-event-time" className="truncate leading-tight">
              {startTime} – {endTime}
            </div>
          </div>
        )}
      </div>
    </Tooltip>
  )
}

export const WeekTimedEvent = memo(WeekTimedEventImpl)
