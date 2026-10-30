import { Temporal } from "@js-temporal/polyfill"
import { useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from "react"

import { findDropDayElement } from "@/contexts/EventDragContext"

import { useDragToCreateSession } from "@/hooks/useDragToCreateSession"
import { useOpenDayDraft } from "@/hooks/useOpenDayDraft"
import {
  clampPointToRect,
  daySelectionForPointer,
  daySelectionRange,
  minutesAtY,
  selectionForPointer,
  selectionRange,
} from "@/lib/drag-to-create"
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

/** An inclusive range of days being drawn to create an all-day event. */
export interface DaySelection {
  readonly start: Temporal.PlainDate
  readonly end: Temporal.PlainDate
}

const SELECTION_ATTR = "data-create-selection"

/**
 * Marks an element that draws part of a `DaySelection`; releasing the drag opens
 * the new-event popover beside the part nearest the pointer, or at the pointer
 * for parts too wide for it to fit beside, like a whole week.
 */
export function createSelectionProps({ anchor }: { anchor: "element" | "pointer" }) {
  return { [SELECTION_ATTR]: anchor } as const
}

function verticalDistance(rect: DOMRect, y: number): number {
  if (y < rect.top) return rect.top - y
  if (y > rect.bottom) return y - rect.bottom
  return 0
}

/**
 * Drag-to-create across the days of a grid, which may span several rows. Days
 * are found by their `dropZoneProps`. Call `startCreateDrag` from a day's
 * `onPointerDown`: only presses on the day itself start a drag, so events keep
 * their own. `selection` is the range to draw while dragging, with
 * `createSelectionProps` on what draws it; releasing opens the new-event
 * popover for it. Dragging near an edge scrolls `scrollContainerRef`.
 */
export function useDayDragToCreate(scrollContainerRef: RefObject<HTMLElement | null>): {
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
      const parts = Array.from(
        (scrollContainerRef.current ?? document).querySelectorAll<HTMLElement>(
          `[${SELECTION_ATTR}]`,
        ),
      )
      const part = parts.reduce<HTMLElement | null>((nearest, candidate) => {
        if (!nearest) return candidate
        return verticalDistance(candidate.getBoundingClientRect(), pointer.y) <
          verticalDistance(nearest.getBoundingClientRect(), pointer.y)
          ? candidate
          : nearest
      }, null)
      const partRect = part?.getBoundingClientRect() ?? originEl.getBoundingClientRect()
      // A snapshot: the selection unmounts once the popover opens.
      const anchorRect =
        part?.getAttribute(SELECTION_ATTR) === "pointer"
          ? new DOMRect(pointer.x, partRect.top, 0, partRect.height)
          : new DOMRect(partRect.left, partRect.top, partRect.width, partRect.height)
      const range = daySelectionRange(selection)

      openDayDraft(
        selection.start,
        { getBoundingClientRect: () => anchorRect },
        { allDay: true, start: range.start, end: range.end },
      )
    },
  })
}
