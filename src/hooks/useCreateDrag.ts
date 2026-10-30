import { useCallback } from "react"

import { useDragToCreateSession } from "@/hooks/useDragToCreateSession"
import { useOpenDayDraft } from "@/hooks/useOpenDayDraft"
import { type DayElement, dayElementAt, scrollParent } from "@/lib/day-grid"
import {
  clampPointToRect,
  type CreateSelection,
  daySelectionForPointer,
  daySelectionRange,
  minutesAtY,
  selectionForPointer,
  selectionRange,
} from "@/lib/drag-to-create"
import { DAY_MINUTES } from "@/lib/event-time"

const SELECTION_ATTR = "data-create-selection"

/**
 * Marks an element that draws part of a days selection; releasing opens the
 * new-event popover beside the part nearest the pointer.
 */
export function createSelectionAttributes() {
  return { [SELECTION_ATTR]: true } as const
}

type Anchor = {
  day: DayElement
  /** Captured at press time: autoscroll moves the column under the pointer. */
  minutes: number
  scrollEl: HTMLElement | null
}

function isSameSelection(a: CreateSelection, b: CreateSelection): boolean {
  if (a.kind === "timed" && b.kind === "timed") {
    return a.day.equals(b.day) && a.startMinutes === b.startMinutes && a.endMinutes === b.endMinutes
  }
  if (a.kind === "days" && b.kind === "days") return a.start.equals(b.start) && a.end.equals(b.end)
  return false
}

function verticalDistance(rect: DOMRect, y: number): number {
  if (y < rect.top) return rect.top - y
  if (y > rect.bottom) return y - rect.bottom
  return 0
}

/**
 * Drag-to-create on the days views mark: a timed range within a "timed"
 * column, or an inclusive range across "day" elements, which may span rows.
 * Releasing opens the new-event popover for it.
 */
export function useCreateDrag(): {
  selection: CreateSelection | null
  startCreateDrag: (
    day: DayElement,
    press: Pick<PointerEvent, "button" | "clientX" | "clientY">,
  ) => void
} {
  const openDayDraft = useOpenDayDraft()

  const session = useDragToCreateSession<Anchor, CreateSelection>({
    selectionAt: (anchor, originEl, pointer) => {
      if (anchor.day.zone === "timed") {
        const pointerMinutes = minutesAtY(originEl.getBoundingClientRect(), pointer.y)
        return {
          kind: "timed",
          day: anchor.day.day,
          ...selectionForPointer(anchor.minutes, pointerMinutes),
        }
      }
      // Clamped so dragging past the grid's edge keeps selecting its edge days.
      const point = anchor.scrollEl
        ? clampPointToRect(anchor.scrollEl.getBoundingClientRect(), pointer.x, pointer.y)
        : pointer
      const hit = dayElementAt(point.x, point.y)
      if (!hit || hit.zone !== anchor.day.zone) return null
      return { kind: "days", ...daySelectionForPointer(anchor.day.day, hit.day) }
    },
    isSameSelection,
    onCommit: (selection, anchor, originEl, pointer) => {
      if (selection.kind === "timed") {
        const range = selectionRange(selection.day, selection)
        const rect = originEl.getBoundingClientRect()
        const midpointMinutes = (selection.startMinutes + selection.endMinutes) / 2
        openDayDraft(selection.day, originEl, {
          allDay: false,
          start: range.start,
          end: range.end,
          anchorY: rect.top + (midpointMinutes / DAY_MINUTES) * rect.height,
        })
        return
      }

      const parts = Array.from(
        (anchor.scrollEl ?? document).querySelectorAll<HTMLElement>(`[${SELECTION_ATTR}]`),
      )
      const part = parts.reduce<HTMLElement | null>((nearest, candidate) => {
        if (!nearest) return candidate
        return verticalDistance(candidate.getBoundingClientRect(), pointer.y) <
          verticalDistance(nearest.getBoundingClientRect(), pointer.y)
          ? candidate
          : nearest
      }, null)
      // A snapshot: the selection unmounts once the popover opens.
      const anchorRect = (part ?? originEl).getBoundingClientRect()
      const range = daySelectionRange(selection)

      openDayDraft(
        selection.start,
        { getBoundingClientRect: () => anchorRect, pointerX: pointer.x },
        { allDay: true, start: range.start, end: range.end },
      )
    },
  })

  const { startCreateDrag } = session
  return {
    selection: session.selection,
    startCreateDrag: useCallback(
      (day, press) => {
        // All-day lanes take double-click and the context menu, but no drag.
        if (day.zone === "all-day") return
        const minutes = minutesAtY(day.el.getBoundingClientRect(), press.clientY)
        startCreateDrag({ day, minutes, scrollEl: scrollParent(day.el) }, day.el, press)
      },
      [startCreateDrag],
    ),
  }
}
