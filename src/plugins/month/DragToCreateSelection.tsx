import { type AllDaySpan, cn, useDayGrid } from "@/sdk"

import { allDayBarStyle } from "./lane-geometry"

export function MonthDragToCreateSelection({ span, lane }: { span: AllDaySpan; lane: number }) {
  const { selectionProps } = useDayGrid()

  return (
    <div
      data-slot="month-create-selection"
      {...selectionProps(span.endCol - span.startCol === 7 ? "pointer" : "element")}
      className={cn(
        "absolute z-10 pointer-events-none",
        span.isStart && "rounded-l-xs",
        span.isEnd && "rounded-r-xs",
      )}
      style={allDayBarStyle(span, lane)}
    />
  )
}
