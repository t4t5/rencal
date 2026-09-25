import { weekEventBox } from "@/components/events-blocks/week-view/TimedEventBlock"

import type { CreateSelection } from "@/lib/drag-to-create"
import { getCreateSelectionStyle } from "@/lib/event-styles"
import { DAY_MINUTES } from "@/lib/event-time"

export function DragToCreateSelection({
  selection,
  calendarColor,
}: {
  selection: CreateSelection
  calendarColor: string | null
}) {
  return (
    <div
      data-slot="week-create-selection"
      className="absolute left-0 z-10 rounded-sm pointer-events-none"
      style={{
        ...weekEventBox(
          (selection.startMinutes / DAY_MINUTES) * 100,
          ((selection.endMinutes - selection.startMinutes) / DAY_MINUTES) * 100,
        ),
        ...getCreateSelectionStyle(calendarColor),
      }}
    />
  )
}
