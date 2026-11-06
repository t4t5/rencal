import { useCallback, type PointerEvent as ReactPointerEvent } from "react"

import { useDragToCreateSession } from "@/hooks/useDragToCreateSession"
import { minutesAtY, selectionForPointer } from "@/lib/drag-to-create"

import type { WeekDay } from "@/views/builtin/week/useInfiniteDays"

import type { DaySegment } from "./day-segments"

type Anchor = { day: WeekDay; anchorMinutes: number }
type Selection = DaySegment & { dayKey: string }

/** Drag on a day column to pick a time, snapped to 15 minutes like drag-to-create. */
export function usePickDrag(onPick: (day: WeekDay, range: DaySegment) => void): {
  dragging: Selection | null
  startDrag: (day: WeekDay, event: ReactPointerEvent<HTMLElement>) => void
} {
  const session = useDragToCreateSession<Anchor, Selection>({
    selectionAt: (anchor, originEl, pointer) => ({
      dayKey: anchor.day.dateKey,
      ...selectionForPointer(
        anchor.anchorMinutes,
        minutesAtY(originEl.getBoundingClientRect(), pointer.y),
      ),
    }),
    isSameSelection: (a, b) =>
      a.dayKey === b.dayKey && a.startMinutes === b.startMinutes && a.endMinutes === b.endMinutes,
    onCommit: ({ startMinutes, endMinutes }, anchor) =>
      onPick(anchor.day, { startMinutes, endMinutes }),
  })

  const { startCreateDrag } = session
  const startDrag = useCallback(
    (day: WeekDay, event: ReactPointerEvent<HTMLElement>) =>
      startCreateDrag(
        {
          day,
          anchorMinutes: minutesAtY(event.currentTarget.getBoundingClientRect(), event.clientY),
        },
        event.currentTarget,
        event,
      ),
    [startCreateDrag],
  )

  return { dragging: session.selection, startDrag }
}
