import { type CreateSelection, selectionProps } from "@/sdk"

import { DAY_MINUTES, weekEventBox } from "./grid"

export function DragToCreateSelection({
  selection,
}: {
  selection: Extract<CreateSelection, { kind: "timed" }>
}) {
  return (
    <div
      data-slot="week-create-selection"
      {...selectionProps()}
      className="absolute left-0 z-10 rounded-sm pointer-events-none"
      style={weekEventBox(
        (selection.startMinutes / DAY_MINUTES) * 100,
        ((selection.endMinutes - selection.startMinutes) / DAY_MINUTES) * 100,
      )}
    />
  )
}
