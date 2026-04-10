import { useRef, useState } from "react"

import { EventContextMenu } from "@/components/EventContextMenu"

import type { WeekTimedEventLayout } from "@/hooks/cal-events/useWeekEventLayout"
import { useTimeFormat } from "@/hooks/useTimeFormat"
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
  onClick: () => void
}

export function WeekTimedEvent({
  layout,
  isActive,
  isPending,
  isDeclined,
  isDraft,
  onClick,
}: WeekTimedEventProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [contextOpen, setContextOpen] = useState(false)
  const { timeFormat } = useTimeFormat()

  const color = layout.color ?? "var(--primary)"
  const widthPercent = 100 / layout.totalColumns
  const leftPercent = layout.column * widthPercent
  const isDashed = isPending || isDeclined || isDraft
  const highlighted = isActive || contextOpen

  const inner = (
    <div
      ref={ref}
      data-event-clickable={!isDraft || undefined}
      className={cn(
        getEventBlockClasses(highlighted, isDeclined),
        "absolute overflow-hidden rounded px-1 py-0.5",
        !isDashed && "pl-2",
        isDraft && "opacity-60",
      )}
      style={{
        top: `${layout.top}%`,
        height: `max(${layout.height}%, 2.125rem)`,
        left: `${leftPercent}%`,
        width: `calc(${widthPercent}% - 2px)`,
        ...getEventBlockStyle(color, highlighted, isDashed),
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
      {!isDashed && (
        <div
          className="w-[3px] absolute left-0 top-0 bottom-0"
          style={{ backgroundColor: color }}
        />
      )}

      <div className="truncate font-medium leading-tight">{layout.event.summary}</div>
      <div className="truncate opacity-80 leading-tight">
        {formatTime(layout.event.start, timeFormat)} – {formatTime(layout.event.end, timeFormat)}
      </div>
    </div>
  )

  if (isDraft) return inner

  return (
    <EventContextMenu event={layout.event} anchorRef={ref} onOpenChange={setContextOpen}>
      {inner}
    </EventContextMenu>
  )
}
