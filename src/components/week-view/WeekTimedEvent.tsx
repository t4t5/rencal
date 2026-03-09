import { format } from "date-fns"

import type { WeekTimedEventLayout } from "@/hooks/cal-events/useWeekEventLayout"
import { setEventAnchor } from "@/lib/event-anchor"
import { cn } from "@/lib/utils"

type WeekTimedEventProps = {
  layout: WeekTimedEventLayout
  isActive: boolean
  onClick: () => void
}

export function WeekTimedEvent({ layout, isActive, onClick }: WeekTimedEventProps) {
  const color = layout.color ?? "var(--primary)"
  const widthPercent = 100 / layout.totalColumns
  const leftPercent = layout.column * widthPercent

  return (
    <div
      data-event-clickable
      className={cn(
        "absolute overflow-hidden rounded px-1 py-0.5 text-xs cursor-default hover:brightness-110",
        isActive && "brightness-150",
      )}
      style={{
        top: layout.top,
        height: layout.height,
        left: `${leftPercent}%`,
        width: `calc(${widthPercent}% - 2px)`,
        backgroundColor: isActive
          ? `color-mix(in srgb, ${color} 50%, black)`
          : `color-mix(in srgb, ${color} 30%, black)`,
        color: isActive
          ? `color-mix(in srgb, ${color} 30%, white)`
          : `color-mix(in srgb, ${color} 70%, white)`,
        borderLeft: `3px solid ${color}`,
      }}
      onClick={(e) => {
        e.stopPropagation()
        setEventAnchor(e.currentTarget)
        onClick()
      }}
    >
      <div className="truncate font-medium leading-tight">{layout.event.summary}</div>
      {layout.height > 30 && (
        <div className="truncate opacity-80 leading-tight">
          {format(layout.event.start, "HH:mm")} – {format(layout.event.end, "HH:mm")}
        </div>
      )}
    </div>
  )
}
