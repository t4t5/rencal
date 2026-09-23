import { memo, useRef, useState } from "react"

import { EventContextMenu } from "@/components/EventContextMenu"
import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { useEventDragHandle, useEventDragRole } from "@/contexts/EventDragContext"
import { useSettings } from "@/contexts/SettingsContext"

import type { WeekTimedEventLayout } from "@/hooks/cal-events/useDayRangeLayout"
import { eventKey, type ResponseStatus } from "@/lib/cal-events"
import { setEventAnchor } from "@/lib/event-anchor"
import { getCalendarEventStyle } from "@/lib/event-styles"
import { formatTime } from "@/lib/event-time"
import { cn } from "@/lib/utils"

function WeekTimedEventImpl({
  layout,
  highlighted: highlightedByParent,
  rsvp,
  isDraft,
  dimmed,
  onEventClick,
}: {
  layout: WeekTimedEventLayout
  highlighted: boolean
  rsvp: ResponseStatus | null
  isDraft: boolean
  dimmed: boolean
  onEventClick: (eventKey: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [contextOpen, setContextOpen] = useState(false)
  const { timeFormat } = useSettings()

  const dragRole = useEventDragRole(layout.event)
  const isDragPreview = dragRole === "preview"
  // Drafts and drag previews are stand-ins: no click, no context menu, no drag.
  const isStatic = isDraft || isDragPreview
  // The floating copy keeps this block's size so it reads as the block being lifted.
  const onDragPointerDown = useEventDragHandle(layout.event, {
    disabled: isStatic,
    float: "block",
  })

  // Cascade layout: each overlap depth indents from the left by a fixed percentage and
  // extends to the right edge, so the earlier/outer event remains fully visible beneath.
  const CASCADE_OFFSET_PCT = 15
  const leftPercent = layout.column * CASCADE_OFFSET_PCT
  const widthPercent = 100 - leftPercent

  const highlighted = highlightedByParent || contextOpen

  const mode = layout.displayMode
  const isDashed = rsvp === "needs-action" || rsvp === "declined"
  const hasStripe = !isDashed && !isDraft

  const summary = layout.event.summary || <UntitledEventText />
  const startTime = formatTime(layout.event.start, timeFormat)
  const endTime = formatTime(layout.event.end, timeFormat)

  const inner = (
    <div
      ref={ref}
      data-slot="calendar-event"
      data-view="week"
      data-kind="timed"
      data-selected={highlighted || undefined}
      data-rsvp={rsvp ?? undefined}
      data-draft={isDraft || undefined}
      data-dimmed={(!isStatic && dimmed) || undefined}
      data-drag-state={dragRole ?? undefined}
      data-event-clickable={!isStatic || undefined}
      className={cn(
        "absolute overflow-hidden rounded-xs px-1 text-xs cursor-default",
        hasStripe && "pl-1.5",
      )}
      style={{
        top: `${layout.top}%`,
        height: `max(${layout.height}%, 1rem)`,
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        // Lift the preview above overlapping neighbours so its ring stays visible.
        zIndex: isDragPreview ? 10 : layout.column,
        ...getCalendarEventStyle({
          calendarColor: layout.calendarColor,
          eventColor: layout.event.color,
        }),
      }}
      onPointerDown={onDragPointerDown}
      onClick={
        isStatic
          ? undefined
          : (e) => {
              e.stopPropagation()
              setEventAnchor(e.currentTarget)
              onEventClick(eventKey(layout.event))
            }
      }
    >
      {hasStripe && (
        <div
          data-slot="calendar-event-color-marker"
          className="absolute left-0 top-0 bottom-0 w-[2px]"
        />
      )}

      {mode === "xs" ? (
        <div className="flex items-baseline gap-1">
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
        <div>
          {/* Title + time on separate lines, no padding */}
          <div data-slot="calendar-event-title" className="truncate font-medium leading-tight">
            {summary}
          </div>
          <div data-slot="calendar-event-time" className="truncate leading-tight">
            {startTime} - {endTime}
          </div>
        </div>
      ) : mode === "md" ? (
        <div className="py-0.5">
          {/* Title + time on separate lines, with padding */}
          <div data-slot="calendar-event-title" className="font-medium leading-tight">
            {summary}
          </div>
          <div data-slot="calendar-event-time" className="truncate leading-tight">
            {startTime} – {endTime}
          </div>
        </div>
      ) : (
        <div className="py-0.5">
          {/* Title = 2 lines, time = 1 line, with padding */}
          <div data-slot="calendar-event-title" className="font-medium leading-tight line-clamp-2">
            {summary}
          </div>
          <div data-slot="calendar-event-time" className="truncate leading-tight">
            {startTime} – {endTime}
          </div>
        </div>
      )}
    </div>
  )

  if (isStatic) return inner

  return (
    <EventContextMenu event={layout.event} anchorRef={ref} onOpenChange={setContextOpen}>
      {inner}
    </EventContextMenu>
  )
}

export const WeekTimedEvent = memo(WeekTimedEventImpl)
