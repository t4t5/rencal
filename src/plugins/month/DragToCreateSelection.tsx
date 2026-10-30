import { type AllDaySpan, cn, createSelectionProps, useCreateSelectionStyle } from "@/sdk"

import { allDayBarStyle } from "./lane-geometry"

export function MonthDragToCreateSelection({ span, lane }: { span: AllDaySpan; lane: number }) {
  const style = useCreateSelectionStyle()

  return (
    <div
      data-slot="month-create-selection"
      {...createSelectionProps({
        anchor: span.endCol - span.startCol === 7 ? "pointer" : "element",
      })}
      className={cn(
        "absolute z-10 pointer-events-none",
        span.isStart && "rounded-l-xs",
        span.isEnd && "rounded-r-xs",
      )}
      style={{ ...allDayBarStyle(span, lane), ...style }}
    />
  )
}
