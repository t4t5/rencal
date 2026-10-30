import { type TimedSelection, useCreateSelectionStyle } from "@/sdk"

import { DAY_MINUTES, weekEventBox } from "./grid"

export function DragToCreateSelection({ selection }: { selection: TimedSelection }) {
  const style = useCreateSelectionStyle()

  return (
    <div
      data-slot="week-create-selection"
      className="absolute left-0 z-10 rounded-sm pointer-events-none"
      style={{
        ...weekEventBox(
          (selection.startMinutes / DAY_MINUTES) * 100,
          ((selection.endMinutes - selection.startMinutes) / DAY_MINUTES) * 100,
        ),
        ...style,
      }}
    />
  )
}
