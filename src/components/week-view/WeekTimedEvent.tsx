import { format } from "date-fns"

import type { WeekTimedEventLayout } from "@/hooks/cal-events/useWeekEventLayout"
import { setEventAnchor } from "@/lib/event-anchor"
import { cn } from "@/lib/utils"

type WeekTimedEventProps = {
  layout: WeekTimedEventLayout
  isActive: boolean
  isPending: boolean
  isDeclined: boolean
  onClick: () => void
}

export function WeekTimedEvent({
  layout,
  isActive,
  isPending,
  isDeclined,
  onClick,
}: WeekTimedEventProps) {
  const color = layout.color ?? "var(--primary)"
  const widthPercent = 100 / layout.totalColumns
  const leftPercent = layout.column * widthPercent
  const isDashed = isPending || isDeclined

  return (
    <div
      data-event-clickable
      className={cn(
        "absolute overflow-hidden rounded px-1 py-0.5 text-xs cursor-default hover:brightness-110",
        !isDashed && "pl-2",
        isActive && "brightness-150",
        isDeclined && "line-through",
      )}
      style={{
        top: `${layout.top}%`,
        height: `max(${layout.height}%, 2.125rem)`,
        left: `${leftPercent}%`,
        width: `calc(${widthPercent}% - 2px)`,
        ...(isDashed
          ? {
              border: `1px dashed ${color}`,
              color: `color-mix(in srgb, ${color} 70%, white)`,
            }
          : {
              backgroundColor: isActive
                ? `color-mix(in srgb, ${color} 50%, black)`
                : `color-mix(in srgb, ${color} 30%, black)`,
              color: isActive
                ? `color-mix(in srgb, ${color} 30%, white)`
                : `color-mix(in srgb, ${color} 70%, white)`,
            }),
      }}
      onClick={(e) => {
        e.stopPropagation()
        setEventAnchor(e.currentTarget)
        onClick()
      }}
    >
      {!isDashed && (
        <div
          className="w-[3px] absolute left-0 top-0 bottom-0"
          style={{ backgroundColor: color }}
        />
      )}

      <div className="truncate font-medium leading-tight">{layout.event.summary}</div>
      {layout.height > 2 && (
        <div className="truncate opacity-80 leading-tight">
          {format(layout.event.start, "HH:mm")} – {format(layout.event.end, "HH:mm")}
        </div>
      )}
    </div>
  )
}
