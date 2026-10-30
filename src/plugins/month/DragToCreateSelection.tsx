import { type AllDayBar, cn, useDayGrid } from "@/sdk"

import { allDayBarStyle } from "./lane-geometry"

export function MonthDragToCreateSelection({ bar }: { bar: AllDayBar<unknown> }) {
  const { selectionProps } = useDayGrid()

  return (
    <div
      data-slot="month-create-selection"
      {...selectionProps(bar.span === 7 ? "pointer" : "element")}
      className={cn(
        "absolute z-10 pointer-events-none",
        bar.isStart && "rounded-l-xs",
        bar.isEnd && "rounded-r-xs",
      )}
      style={allDayBarStyle(bar)}
    />
  )
}
