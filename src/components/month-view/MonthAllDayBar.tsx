import type { AllDayLaneItem } from "@/hooks/cal-events/useMonthEventLayout"
import { setEventAnchor } from "@/lib/event-anchor"
import { cn } from "@/lib/utils"

type MonthAllDayBarProps = {
  item: AllDayLaneItem
  isActive: boolean
  isPending: boolean
  onClick: () => void
}

export function MonthAllDayBar({ item, isActive, isPending, onClick }: MonthAllDayBarProps) {
  const color = item.color ?? "var(--primary)"

  return (
    <div
      data-event-clickable
      className={cn(
        "text-xs truncate px-1 py-px cursor-default leading-4 hover:brightness-110",
        isActive && "brightness-150",
        isPending && "opacity-50",
        item.isStart ? "rounded-l ml-px" : "-ml-px",
        item.isEnd ? "rounded-r mr-px" : "-mr-px",
      )}
      style={{
        gridColumn: `${item.startCol} / ${item.endCol}`,
        gridRow: item.lane + 1,
        backgroundColor: isActive
          ? `color-mix(in srgb, ${color} 50%, black)`
          : `color-mix(in srgb, ${color} 30%, black)`,
        color: isActive
          ? `color-mix(in srgb, ${color} 30%, white)`
          : `color-mix(in srgb, ${color} 70%, white)`,
      }}
      onClick={(e) => {
        e.stopPropagation()
        setEventAnchor(e.currentTarget)
        onClick()
      }}
    >
      {item.event.summary}
    </div>
  )
}
