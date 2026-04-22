import { useRef, useState } from "react"

import { EventContextMenu } from "@/components/EventContextMenu"
import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { useSettings } from "@/contexts/SettingsContext"

import type { WeekTimedEventLayout } from "@/hooks/cal-events/useWeekEventLayout"
import { setEventAnchor } from "@/lib/event-anchor"
import { getEventBlockClasses, getEventBlockStyle } from "@/lib/event-styles"
import { formatTime } from "@/lib/time"
import { cn } from "@/lib/utils"

type WeekTimedEventProps = {
  layout: WeekTimedEventLayout
  isActive: boolean
  isPending: boolean
  isDeclined: boolean
  isDraft: boolean
  dimmed: boolean
  onClick: () => void
}

export function WeekTimedEvent({
  layout,
  isActive,
  isPending,
  isDeclined,
  isDraft,
  dimmed,
  onClick,
}: WeekTimedEventProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [contextOpen, setContextOpen] = useState(false)
  const { timeFormat } = useSettings()

  const color = layout.color ?? "var(--primary)"
  // Cascade layout: each overlap depth indents from the left by a fixed percentage and
  // extends to the right edge, so the earlier/outer event remains fully visible beneath.
  const CASCADE_OFFSET_PCT = 15
  const leftPercent = layout.column * CASCADE_OFFSET_PCT
  const widthPercent = 100 - leftPercent
  const isDashed = isPending || isDeclined
  const highlighted = isActive || contextOpen
  const mode = layout.displayMode
  const isCompact = mode === "compact"
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
        "absolute overflow-hidden rounded px-1 py-0.5",
        hasStripe && (isCompact ? "pl-1.5" : "pl-2"),
        !isDraft && dimmed && "opacity-50",
        isDraft && "font-medium",
      )}
      style={{
        top: `${layout.top}%`,
        height: `max(${layout.height}%, 1rem)`,
        left: `${leftPercent}%`,
        width: `calc(${widthPercent}% - 2px)`,
        zIndex: layout.column,
        border: "1px solid var(--day-bg)",
        ...getEventBlockStyle(color, layout.eventColor, highlighted, isDashed, isDraft),
      }}
      onClick={
        isDraft
          ? undefined
          : (e) => {
              e.stopPropagation()
              setEventAnchor(e.currentTarget)
              onClick()
            }
      }
    >
      {hasStripe && (
        <div
          className={cn("absolute left-0 top-0 bottom-0", isCompact ? "w-[2px]" : "w-[3px]")}
          style={{ backgroundColor: color }}
        />
      )}

      {mode === "compact" ? (
        <div className="flex items-baseline gap-1">
          <span className="truncate font-medium leading-tight min-w-0 flex-1">{summary}</span>
          <span className="text-[10px] opacity-70 shrink-0 leading-tight">{startTime}</span>
        </div>
      ) : mode === "standard" ? (
        <>
          <div className="truncate font-medium leading-tight">{summary}</div>
          <div className="truncate opacity-80 leading-tight">{startTime}</div>
        </>
      ) : (
        <>
          <div className="font-medium leading-tight line-clamp-2">{summary}</div>
          <div className="truncate opacity-80 leading-tight">
            {startTime} – {endTime}
          </div>
        </>
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
