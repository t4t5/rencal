import { memo, useRef, useState } from "react"

import { EventContextMenu } from "@/components/EventContextMenu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { useEventDragHandle, useEventDragRole } from "@/contexts/EventDragContext"
import { useSettings } from "@/contexts/SettingsContext"

import type { WeekTimedEventLayout } from "@/hooks/cal-events/useDayRangeLayout"
import { eventKey, type ResponseStatus } from "@/lib/cal-events"
import { setEventAnchor } from "@/lib/event-anchor"
import { getCalendarEventStyle } from "@/lib/event-styles"
import { formatTime } from "@/lib/event-time"
import { cn } from "@/lib/utils"

const WEEK_EVENT_RIGHT_GAP = 12

/**
 * Block edges shared with the create selection: the top covers the start hour's grid
 * line, the bottom stops short of the end hour's, and a right gap keeps the column clickable.
 */
export function weekEventBox(topPercent: number, heightPercent: number) {
  /* eslint-disable lingui/no-unlocalized-strings -- CSS calc() values */
  return {
    top: `calc(${topPercent}% - 1px)`,
    height: `max(calc(${heightPercent}% - 3px), 1rem)`,
    right: WEEK_EVENT_RIGHT_GAP,
  }
}

/** Places an overlap layout's shares within the width left of the right gap. */
function overlapBox({ left, width, coveredWidth }: WeekTimedEventLayout) {
  const area = `(100% - ${WEEK_EVENT_RIGHT_GAP}px)`
  return {
    left: `calc(${area} * ${left})`,
    width: `calc(${area} * ${width})`,
    right: "auto",
    // Wrap text before the neighbour drawn over this block's right edge.
    paddingRight: coveredWidth
      ? `calc(${area} * ${coveredWidth} + var(--event-padding-inline))`
      : undefined,
  }
  /* eslint-enable lingui/no-unlocalized-strings */
}

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
  const [tooltipOpen, setTooltipOpen] = useState(false)
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
        "absolute overflow-hidden rounded-sm px-(--event-padding-inline) text-xs cursor-default",
        hasStripe && "pl-[calc(var(--event-padding-inline)+4px)]",
      )}
      style={{
        ...weekEventBox(layout.top, layout.height),
        ...overlapBox(layout),
        // Overlaps paint in layout order; lift the preview above them so its ring stays visible.
        zIndex: isDragPreview ? 10 : undefined,
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
      <Tooltip
        delayDuration={500}
        // Stay out of the way while the event is being dragged or its menu is open.
        open={tooltipOpen && !dragRole && !contextOpen}
        onOpenChange={setTooltipOpen}
      >
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="right" className="max-w-64 flex-col items-start gap-0.5">
          <span className="font-medium wrap-break-word">{summary}</span>
          <span>
            {startTime} – {endTime}
          </span>
          {layout.event.location && (
            <span className="wrap-break-word">{layout.event.location}</span>
          )}
        </TooltipContent>
      </Tooltip>
    </EventContextMenu>
  )
}

export const WeekTimedEvent = memo(WeekTimedEventImpl)
