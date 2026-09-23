import { useRef, useState } from "react"

import { EventContextMenu } from "@/components/EventContextMenu"
import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { useEventDragHandle, useEventDragRole } from "@/contexts/EventDragContext"
import { useSettings } from "@/contexts/SettingsContext"

import type { TimedEventItem } from "@/hooks/cal-events/useMonthEventLayout"
import type { ResponseStatus } from "@/lib/cal-events"
import { setEventAnchor } from "@/lib/event-anchor"
import { getCalendarEventStyle } from "@/lib/event-styles"
import { formatTime } from "@/lib/event-time"
import { cn } from "@/lib/utils"

export function MonthTimedEvent({
  item,
  highlighted: highlightedByParent,
  rsvp,
  isDraft,
  dimmed,
  onClick,
}: {
  item: TimedEventItem
  highlighted: boolean
  rsvp: ResponseStatus | null
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

  const inner = (
    <div
      ref={ref}
      data-slot="calendar-event"
      data-view="month"
      data-kind="timed"
      data-selected={highlighted || undefined}
      data-rsvp={rsvp ?? undefined}
      data-draft={isDraft || undefined}
      data-dimmed={(!isStatic && dimmed) || undefined}
      data-drag-state={dragRole ?? undefined}
      data-event-clickable={!isStatic || undefined}
      className={cn(
        "flex items-center gap-1 text-xs truncate cursor-default rounded-base shrink-0",
      )}
      style={getCalendarEventStyle({
        calendarColor: item.color,
        eventColor: item.eventColor,
      })}
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
      <div data-slot="calendar-event-color-marker" className="w-0.5 h-full shrink-0" />
      <span className="truncate">
        <span data-slot="calendar-event-time" data-typography="numerical" className="text-2xs">
          {formatTime(item.event.start, timeFormat)}
        </span>{" "}
        <span data-slot="calendar-event-title">{item.event.summary || <UntitledEventText />}</span>
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
