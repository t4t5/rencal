import type { AllDaySpan } from "@/hooks/cal-events/all-day-lanes"
import { getCreateSelectionStyle } from "@/lib/event-styles"
import { cn } from "@/lib/utils"

import { allDayBarStyle } from "./lane-geometry"

export function MonthDragToCreateSelection({
  span,
  lane,
  calendarColor,
}: {
  span: AllDaySpan
  lane: number
  calendarColor: string | null
}) {
  return (
    <div
      data-create-selection={span.endCol - span.startCol === 7 ? "full" : "partial"}
      className={cn(
        "absolute z-10 pointer-events-none",
        span.isStart && "rounded-l",
        span.isEnd && "rounded-r",
      )}
      style={{ ...allDayBarStyle(span, lane), ...getCreateSelectionStyle(calendarColor) }}
    />
  )
}
