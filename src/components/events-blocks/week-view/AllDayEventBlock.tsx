import { useRef, useState } from "react"

import { EventContextMenu } from "@/components/EventContextMenu"
import { GUTTER_WIDTH } from "@/components/main/week-view/WeekTimeGrid"
import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { useEventDragHandle, useEventDragRole } from "@/contexts/EventDragContext"

import type { AllDayLaneItem } from "@/hooks/cal-events/all-day-lanes"
import type { ResponseStatus } from "@/lib/cal-events"
import { pointAnchorFromClick, setEventAnchor } from "@/lib/event-anchor"
import { getCalendarEventStyle } from "@/lib/event-styles"
import { cn } from "@/lib/utils"

export function WeekAllDayBar({
  item,
  colOffset,
  rowOffset,
  highlighted: highlightedByParent,
  rsvp,
  isDraft,
  dimmed,
  onClick,
}: {
  item: AllDayLaneItem
  // Added to item.startCol/endCol so bar aligns with the parent grid's day columns:
  colOffset: number
  // Added to item.lane so bar lands on the right row in the parent grid:
  rowOffset: number
  highlighted: boolean
  rsvp: ResponseStatus | null
  isDraft: boolean
  dimmed: boolean
  onClick: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [contextOpen, setContextOpen] = useState(false)

  const dragRole = useEventDragRole(item.event)
  const isDragPreview = dragRole === "preview"
  // Drafts and drag previews are stand-ins: no click, no context menu, no drag.
  const isStatic = isDraft || isDragPreview
  const onDragPointerDown = useEventDragHandle(item.event, { disabled: isStatic })

  const highlighted = highlightedByParent || contextOpen
  const fillsRow = item.endCol - item.startCol >= 7

  const inner = (
    <div
      data-slot="week-all-day-lane"
      className={cn("p-0.5 py-px pr-[3px]", isDragPreview && "pointer-events-none")}
      style={{
        gridColumn: `${item.startCol + colOffset} / ${item.endCol + colOffset}`,
        gridRow: item.lane + 1 + rowOffset,
      }}
    >
      <div
        ref={ref}
        data-slot="calendar-event"
        data-view="week"
        data-kind="all-day"
        data-selected={highlighted || undefined}
        data-rsvp={rsvp ?? undefined}
        data-draft={isDraft || undefined}
        data-dimmed={(!isStatic && dimmed) || undefined}
        data-drag-state={dragRole ?? undefined}
        data-event-clickable={!isStatic || undefined}
        className={cn("flex items-center px-1 py-px leading-4 rounded-xs text-xs cursor-default")}
        style={getCalendarEventStyle({
          calendarColor: item.calendarColor,
          eventColor: item.event.color,
        })}
        onPointerDown={onDragPointerDown}
        onClick={
          isStatic
            ? undefined
            : (e) => {
                e.stopPropagation()
                setEventAnchor(fillsRow ? pointAnchorFromClick(e) : e.currentTarget)
                onClick()
              }
        }
      >
        {/* Make title in multi-day event sticky so it stays visible when user scrolls: */}
        <span
          data-slot="calendar-event-title"
          className="sticky truncate min-w-0"
          style={{ left: GUTTER_WIDTH + 4 }}
        >
          {item.event.summary || <UntitledEventText />}
        </span>
      </div>
    </div>
  )

  if (isStatic) return inner

  return (
    <EventContextMenu event={item.event} anchorRef={ref} onOpenChange={setContextOpen}>
      {inner}
    </EventContextMenu>
  )
}
