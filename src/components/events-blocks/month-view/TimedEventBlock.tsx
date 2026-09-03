import { useRef, useState } from "react"

import { EventContextMenu } from "@/components/EventContextMenu"
import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { useEventDragHandle, useEventDragRole } from "@/contexts/EventDragContext"
import { useSettings } from "@/contexts/SettingsContext"

import type { TimedEventItem } from "@/hooks/cal-events/useMonthEventLayout"
import { setEventAnchor } from "@/lib/event-anchor"
import { getEventBlockColors, getEventBlockStyle } from "@/lib/event-styles"
import { formatTime } from "@/lib/event-time"
import { cn } from "@/lib/utils"

export function MonthTimedEvent({
  item,
  highlighted: highlightedByParent,
  isPending,
  isDeclined,
  isDraft,
  dimmed,
  onClick,
}: {
  item: TimedEventItem
  highlighted: boolean
  isPending: boolean
  isDeclined: boolean
  isDraft: boolean
  dimmed: boolean
  onClick: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [contextOpen, setContextOpen] = useState(false)
  const { timeFormat } = useSettings()

  const dragRole = useEventDragRole(item.event)
  const isDragPreview = dragRole === "preview"
  // Drafts and drag previews are stand-ins: no click, no context menu, no drag.
  const isStatic = isDraft || isDragPreview
  const onDragPointerDown = useEventDragHandle(item.event, { disabled: isStatic })

  const highlighted = highlightedByParent || contextOpen

  const colors = getEventBlockColors({
    calendarColor: item.color,
    eventColor: item.eventColor,
    highlighted,
  })

  const inner = (
    <div
      ref={ref}
      data-event-clickable={!isStatic || undefined}
      className={cn(
        "flex items-center gap-1 text-xs truncate cursor-default hover:bg-hover rounded shrink-0",
        highlighted && "bg-accent!",
        (isPending || isDeclined) && "opacity-50",
        !isStatic && dimmed && "opacity-50",
        isDraft && "font-medium border border-dashed",
        isDeclined && "line-through",
        dragRole === "source" && "opacity-40",
        isDragPreview && "pointer-events-none",
      )}
      style={
        isDraft
          ? {
              backgroundColor: colors.backgroundColor,
              borderColor: colors.borderColor,
              color: colors.textColor,
            }
          : isDragPreview
            ? getEventBlockStyle({
                calendarColor: item.color,
                eventColor: item.eventColor,
                isDragPreview: true,
              })
            : undefined
      }
      onPointerDown={onDragPointerDown}
      onClick={
        isStatic
          ? undefined
          : (e) => {
              e.stopPropagation()
              setEventAnchor(e.currentTarget)
              onClick()
            }
      }
    >
      <div className="w-0.5 h-full shrink-0" style={{ backgroundColor: colors.borderColor }} />
      <span className="truncate">
        <span
          className="text-[10px] numerical"
          style={{
            color: colors.textColor,
          }}
        >
          {formatTime(item.event.start, timeFormat)}
        </span>{" "}
        {item.event.summary || <UntitledEventText />}
      </span>
    </div>
  )

  if (isStatic) return inner

  return (
    <EventContextMenu event={item.event} anchorRef={ref} onOpenChange={setContextOpen}>
      {inner}
    </EventContextMenu>
  )
}
