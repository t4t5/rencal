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
      className="absolute left-0 right-0 z-10 rounded-sm pointer-events-none"
      style={{
        top: `${(selection.startMinutes / DAY_MINUTES) * 100}%`,
        height: `${((selection.endMinutes - selection.startMinutes) / DAY_MINUTES) * 100}%`,
        ...getCreateSelectionStyle(calendarColor),
      }}
    />
  )
}
