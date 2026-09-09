import { Temporal } from "@js-temporal/polyfill"
import { type PointerEvent as ReactPointerEvent, type RefObject } from "react"

import { findDropDayElement } from "@/contexts/EventDragContext"

import { useDragToCreateSession } from "@/hooks/useDragToCreateSession"
import { useOpenDayDraft } from "@/hooks/useOpenDayDraft"
import {
  clampPointToRect,
  daySelectionForPointer,
  daySelectionRange,
  type DaySelection,
} from "@/lib/drag-to-create"

function verticalDistance(rect: DOMRect, y: number): number {
  if (y < rect.top) return rect.top - y
  if (y > rect.bottom) return y - rect.bottom
  return 0
}

export function useDragToCreateDays(scrollContainerRef: RefObject<HTMLDivElement | null>): {
  selection: DaySelection | null
  startCreateDrag: (day: Temporal.PlainDate, event: ReactPointerEvent<HTMLElement>) => void
} {
  const openDayDraft = useOpenDayDraft()

  return useDragToCreateSession<Temporal.PlainDate, DaySelection>({
    scrollContainerRef,
    selectionAt: (anchor, _originEl, pointer) => {
      const scrollEl = scrollContainerRef.current
      if (!scrollEl) return null
      const point = clampPointToRect(scrollEl.getBoundingClientRect(), pointer.x, pointer.y)
      const hit = findDropDayElement(point.x, point.y)
      return hit ? daySelectionForPointer(anchor, hit.day) : null
    },
    isSameSelection: (a, b) => a.start.equals(b.start) && a.end.equals(b.end),
    onCommit: (selection, _anchor, originEl, pointer) => {
      const segments = Array.from(document.querySelectorAll<HTMLElement>("[data-create-selection]"))
      const segment = segments.reduce<HTMLElement | null>((nearest, candidate) => {
        if (!nearest) return candidate
        return verticalDistance(candidate.getBoundingClientRect(), pointer.y) <
          verticalDistance(nearest.getBoundingClientRect(), pointer.y)
          ? candidate
          : nearest
      }, null)
      const segmentRect = segment?.getBoundingClientRect() ?? originEl.getBoundingClientRect()
      const snapshotRect =
        segment?.dataset.createSelection === "full"
          ? new DOMRect(pointer.x, segmentRect.top, 0, segmentRect.height)
          : new DOMRect(segmentRect.left, segmentRect.top, segmentRect.width, segmentRect.height)
      const range = daySelectionRange(selection)

      openDayDraft(
        selection.start,
        { getBoundingClientRect: () => snapshotRect },
        {
          allDay: true,
          start: range.start,
          end: range.end,
        },
      )
    },
  })
}
