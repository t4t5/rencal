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
  timedSelection,
} from "@/lib/drag-to-create"
import { epochDay } from "@/lib/event-time"

const SELECTION_ATTR = "data-create-selection"

/**
 * Marks an element that draws part of a selection; releasing opens the
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
  if (a.kind === "days" && b.kind === "days") {
    return a.firstDay.equals(b.firstDay) && a.lastDay.equals(b.lastDay)
  }
  return false
}

function distance(rect: DOMRect, x: number, y: number): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right)
  const dy = Math.max(rect.top - y, 0, y - rect.bottom)
  return Math.hypot(dx, dy)
}

/** The drawn part of the selection nearest the pointer. */
function nearestSelectionPart(root: ParentNode, x: number, y: number): HTMLElement | null {
  const parts = Array.from(root.querySelectorAll<HTMLElement>(`[${SELECTION_ATTR}]`))
  return parts.reduce<HTMLElement | null>(
    (nearest, candidate) =>
      !nearest ||
      distance(candidate.getBoundingClientRect(), x, y) <
        distance(nearest.getBoundingClientRect(), x, y)
        ? candidate
        : nearest,
    null,
  )
}

/**
 * Drag-to-create on the days views mark: a timed range across "timed" columns,
 * or an inclusive range across "day" elements, which may span rows. Releasing
 * opens the new-event popover for it.
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
      // Clamped so dragging past the grid's edge keeps selecting its edge days.
      const point = anchor.scrollEl
        ? clampPointToRect(anchor.scrollEl.getBoundingClientRect(), pointer.x, pointer.y)
        : pointer

      if (anchor.day.zone === "timed") {
        // Columns line up with the origin's; above or below them, take the column at its edge.
        const column = originEl.getBoundingClientRect()
        const y = Math.max(column.top + 1, Math.min(column.bottom - 1, point.y))
        const hit = dayElementAt(point.x, y, "timed")
        if (!hit) return null
        const range = selectionForPointer(
          anchor.minutes,
          minutesAtY(column, pointer.y),
          epochDay(hit.day) - epochDay(anchor.day.day),
        )
        return timedSelection(anchor.day.day, range)
      }

      const hit = dayElementAt(point.x, point.y)
      if (!hit || hit.zone !== anchor.day.zone) return null
      return { kind: "days", ...daySelectionForPointer(anchor.day.day, hit.day) }
    },
    isSameSelection,
    onCommit: (selection, anchor, originEl, pointer) => {
      const part = nearestSelectionPart(anchor.scrollEl ?? document, pointer.x, pointer.y)

      if (selection.kind === "timed") {
        const range = selectionRange(selection.day, selection)
        // Beside the part's column, level with the part's middle.
        const column = part?.closest<HTMLElement>("[data-day-key]") ?? originEl
        const rect = (part ?? originEl).getBoundingClientRect()
        openDayDraft(selection.day, column, {
          allDay: false,
          start: range.start,
          end: range.end,
          anchorY: rect.top + rect.height / 2,
        })
        return
      }

      // A snapshot: the selection unmounts once the popover opens.
      const anchorRect = (part ?? originEl).getBoundingClientRect()
      const range = daySelectionRange(selection)

      openDayDraft(
        selection.firstDay,
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
