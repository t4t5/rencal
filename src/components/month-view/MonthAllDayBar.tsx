import type { AllDayLaneItem } from "@/hooks/cal-events/useMonthEventLayout"
import { cn } from "@/lib/utils"

type MonthAllDayBarProps = {
  item: AllDayLaneItem
  onClick: () => void
}

export function MonthAllDayBar({ item, onClick }: MonthAllDayBarProps) {
  return (
    <div
      className={cn(
        "text-xs truncate px-1 py-px cursor-default leading-4 hover:brightness-110",
        item.isStart ? "rounded-l ml-px" : "-ml-px",
        item.isEnd ? "rounded-r mr-px" : "-mr-px",
      )}
      style={{
        gridColumn: `${item.startCol} / ${item.endCol}`,
        gridRow: item.lane + 1,
        backgroundColor: `color-mix(in srgb, ${item.color ?? "var(--primary)"} 30%, black)`,
        color: `color-mix(in srgb, ${item.color ?? "var(--primary)"} 70%, white)`,
      }}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {item.event.summary}
    </div>
  )
}
