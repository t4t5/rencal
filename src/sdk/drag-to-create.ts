import { Temporal } from "@js-temporal/polyfill"
import { useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from "react"

import { useDragToCreateSession } from "@/hooks/useDragToCreateSession"
import { useOpenDayDraft } from "@/hooks/useOpenDayDraft"
import { minutesAtY, selectionForPointer, selectionRange } from "@/lib/drag-to-create"
import { DAY_MINUTES } from "@/lib/event-time"

/** A range being drawn in one day column, in wallclock minutes snapped to 15. */
export interface TimedSelection {
  readonly day: Temporal.PlainDate
  readonly startMinutes: number
  readonly endMinutes: number
}

type TimedAnchor = { day: Temporal.PlainDate; anchorMinutes: number }

/**
 * Drag-to-create for the day columns of a time grid, where each column spans
 * 00:00 at its top to 24:00 at its bottom. Call `startCreateDrag` from a
 * column's `onPointerDown`: only presses on the column itself start a drag, so
 * events keep their own. `selection` is the range to draw while dragging;
 * releasing opens the new-event popover for it. Dragging near an edge scrolls
 * `scrollContainerRef`.
 */
export function useTimedDragToCreate(scrollContainerRef: RefObject<HTMLElement | null>): {
  selection: TimedSelection | null
  startCreateDrag: (day: Temporal.PlainDate, event: ReactPointerEvent<HTMLElement>) => void
} {
  const openDayDraft = useOpenDayDraft()
  const session = useDragToCreateSession<TimedAnchor, TimedSelection>({
    scrollContainerRef,
    selectionAt: (anchor, originEl, pointer) => ({
      day: anchor.day,
      ...selectionForPointer(
        anchor.anchorMinutes,
        minutesAtY(originEl.getBoundingClientRect(), pointer.y),
      ),
    }),
    isSameSelection: (a, b) =>
      a.day.equals(b.day) && a.startMinutes === b.startMinutes && a.endMinutes === b.endMinutes,
    onCommit: (selection, anchor, originEl) => {
      const range = selectionRange(anchor.day, selection)
      const rect = originEl.getBoundingClientRect()
      const midpointMinutes = (selection.startMinutes + selection.endMinutes) / 2
      const anchorY = rect.top + (midpointMinutes / DAY_MINUTES) * rect.height
      openDayDraft(anchor.day, originEl, {
        allDay: false,
        start: range.start,
        end: range.end,
        anchorY,
      })
    },
  })

  const { startCreateDrag } = session
  return {
    selection: session.selection,
    startCreateDrag: useCallback(
      (day: Temporal.PlainDate, event: ReactPointerEvent<HTMLElement>) => {
        startCreateDrag(
          {
            day,
            anchorMinutes: minutesAtY(event.currentTarget.getBoundingClientRect(), event.clientY),
          },
          event,
        )
      },
      [startCreateDrag],
    ),
  }
}
