import { useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from "react"

import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { useDragToCreateSession } from "@/hooks/useDragToCreateSession"
import type { InstantSpan } from "@/lib/api"
import { minutesAtY, selectionForPointer } from "@/lib/drag-to-create"

import { type DaySegment, instantAt } from "./day-segments"

type Anchor = { day: MonthDay; anchorMinutes: number }
type Selection = DaySegment & { dayKey: string }

/** Drag on a day column to pick a time, snapped to 15 minutes like drag-to-create. */
export function useShareDrag(
  scrollContainerRef: RefObject<HTMLDivElement | null>,
  tzid: string,
  onPick: (span: InstantSpan) => void,
): {
  dragging: Selection | null
  startDrag: (day: MonthDay, event: ReactPointerEvent<HTMLElement>) => void
} {
  const session = useDragToCreateSession<Anchor, Selection>({
    scrollContainerRef,
    selectionAt: (anchor, originEl, pointer) => ({
      dayKey: anchor.day.dateKey,
      ...selectionForPointer(
        anchor.anchorMinutes,
        minutesAtY(originEl.getBoundingClientRect(), pointer.y),
      ),
    }),
    isSameSelection: (a, b) =>
      a.dayKey === b.dayKey && a.startMinutes === b.startMinutes && a.endMinutes === b.endMinutes,
    onCommit: (selection, anchor) =>
      onPick({
        start: instantAt(anchor.day.date, selection.startMinutes, tzid),
        end: instantAt(anchor.day.date, selection.endMinutes, tzid),
      }),
  })

  const startDrag = useCallback(
    (day: MonthDay, event: ReactPointerEvent<HTMLElement>) =>
      session.startCreateDrag(
        {
          day,
          anchorMinutes: minutesAtY(event.currentTarget.getBoundingClientRect(), event.clientY),
        },
        event,
      ),
    [session.startCreateDrag],
  )

  return { dragging: session.selection, startDrag }
}
