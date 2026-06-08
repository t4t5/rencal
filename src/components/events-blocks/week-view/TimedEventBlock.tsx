import { memo, useRef, useState } from "react"

import { EventContextMenu } from "@/components/EventContextMenu"
import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { useSettings } from "@/contexts/SettingsContext"

import type { WeekTimedEventLayout } from "@/hooks/cal-events/useDayRangeLayout"
import { eventKey } from "@/lib/cal-events"
import { setEventAnchor } from "@/lib/event-anchor"
import { getEventBlockClasses, getEventBlockColors, getEventBlockStyle } from "@/lib/event-styles"
import { formatTime } from "@/lib/event-time"
import { cn } from "@/lib/utils"

function WeekTimedEventImpl({
  layout,
  highlighted: highlightedByParent,
  isPending,
  isDeclined,
  isDraft,
  dimmed,
  onEventClick,
}: {
  layout: WeekTimedEventLayout
  highlighted: boolean
  isPending: boolean
  isDeclined: boolean
  isDraft: boolean
  dimmed: boolean
  onEventClick: (eventKey: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [contextOpen, setContextOpen] = useState(false)
  const { timeFormat } = useSettings()

  // Cascade layout: each overlap depth indents from the left by a fixed percentage and
  // extends to the right edge, so the earlier/outer event remains fully visible beneath.
  const CASCADE_OFFSET_PCT = 15
  const leftPercent = layout.column * CASCADE_OFFSET_PCT
  const widthPercent = 100 - leftPercent

  const isDashed = isPending || isDeclined
  const highlighted = highlightedByParent || contextOpen

  const colors = getEventBlockColors({
    calendarColor: layout.calendarColor,
    eventColor: layout.event.color,
    highlighted,
    isDraft,
    isDashed,
  })

  const mode = layout.displayMode
  const hasStripe = !isDashed && !isDraft

  const summary = layout.event.summary || <UntitledEventText />
  const startTime = formatTime(layout.event.start, timeFormat)
  const endTime = formatTime(layout.event.end, timeFormat)

  const inner = (
    <div
      ref={ref}
      data-event-clickable={!isDraft || undefined}
      className={cn(
        getEventBlockClasses(highlighted, isDeclined),
        "absolute overflow-hidden rounded px-1",
        hasStripe && "pl-1.5",
        !isDraft && dimmed && "opacity-50",
        isDraft && "font-medium",
      )}
      style={{
        top: `${layout.top}%`,
        height: `max(${layout.height}%, 1rem)`,
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        zIndex: layout.column,
        border: "1px solid var(--background)",
        ...getEventBlockStyle({
          calendarColor: layout.calendarColor,
          eventColor: layout.event.color,
          highlighted,
          isDashed,
          isDraft,
        }),
      }}
      onClick={
        isDraft
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
          className={cn("absolute left-0 top-0 bottom-0 w-[2px]")}
          style={{ backgroundColor: colors.borderColor }}
        />
      )}

      {mode === "xs" ? (
        <div className="flex items-baseline gap-1">
          {/* Title + time on one line */}
          <span className="truncate font-medium leading-tight min-w-0 flex-1">{summary}</span>
          <span className="text-[10px] opacity-70 shrink-0 leading-tight">{startTime}</span>
        </div>
      ) : mode === "sm" ? (
        <div>
          {/* Title + time on separate lines, no padding */}
          <div className="truncate font-medium leading-tight">{summary}</div>
          <div className="truncate opacity-80 leading-tight">
            {startTime} - {endTime}
          </div>
        </div>
      ) : mode === "md" ? (
        <div className="py-0.5">
          {/* Title + time on separate lines, with padding */}
          <div className="font-medium leading-tight">{summary}</div>
          <div className="truncate opacity-80 leading-tight">
            {startTime} – {endTime}
          </div>
        </div>
      ) : (
        <div className="py-0.5">
          {/* Title = 2 lines, time = 1 line, with padding */}
          <div className="font-medium leading-tight line-clamp-2">{summary}</div>
          <div className="truncate opacity-80 leading-tight">
            {startTime} – {endTime}
          </div>
        </div>
      )}
    </div>
  )

  if (isDraft) return inner

  return (
    <EventContextMenu event={layout.event} anchorRef={ref} onOpenChange={setContextOpen}>
      {inner}
    </EventContextMenu>
  )
}

export const WeekTimedEvent = memo(WeekTimedEventImpl)
