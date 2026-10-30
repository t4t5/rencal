import { type AllDayBar, cn, selectionProps } from "@/sdk"

import { allDayBarStyle } from "./lane-geometry"

export function MonthDragToCreateSelection({ bar }: { bar: AllDayBar<unknown> }) {
  return (
    <div
      data-slot="month-create-selection"
      {...selectionProps()}
      className={cn(
        "absolute z-10 pointer-events-none",
        bar.isStart && "rounded-l-xs",
        bar.isEnd && "rounded-r-xs",
      )}
      style={allDayBarStyle(bar)}
    />
  )
}
