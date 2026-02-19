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
        "text-xs text-white truncate px-1 py-px cursor-default leading-4",
        item.isStart ? "rounded-l ml-px" : "-ml-px",
        item.isEnd ? "rounded-r mr-px" : "-mr-px",
      )}
      style={{
        gridColumn: `${item.startCol} / ${item.endCol}`,
        gridRow: item.lane + 1,
        backgroundColor: item.color ?? "var(--primary)",
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
