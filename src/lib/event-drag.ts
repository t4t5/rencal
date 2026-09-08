/*
 * Drag-to-reschedule math. Pure helpers shared by the drag controller in
 * `EventDragContext`; DOM hit-testing lives there, not here.
 *
 * A drag moves an event by a whole-day delta (month cells, all-day lanes) and,
 * in the week time grid, an additional wallclock-minute delta. Deltas are
 * applied to both start and end so the duration and the event's own timezone
 * are preserved: dragging never re-zones or re-kinds an event.
 */
import { Temporal } from "@js-temporal/polyfill"

import { withDates, type CalendarEvent } from "@/lib/cal-events"
import { addDays, addMinutes, DAY_MINUTES, epochDay, type EventTimeRange } from "@/lib/event-time"
import { isSpanning } from "@/lib/event-utils"

/**
 * Grid regions an event can be dropped on, declared via `data-drop-zone` on the
 * DOM together with `data-drop-day` (a `YYYY-MM-DD` key):
 *
 * - "day": a month-view cell. Any event, keeps its wallclock time.
 * - "all-day": the week view's all-day lane. Spanning events only.
 * - "timed": a week-view day column. Single-day timed events only.
 */
export type DropZone = "day" | "all-day" | "timed"

/** Where the pointer currently is, resolved from the DOM. */
export type DropHit = {
  zone: DropZone
  day: Temporal.PlainDate
  /** Viewer-zone wallclock minutes-of-day under the pointer; "timed" zone only. */
  minutes: number | null
}

/**
 * Where the event was grabbed relative to its own start, so the block follows
 * the pointer instead of snapping its start to it. A multi-day bar grabbed on
 * its third day keeps that day under the pointer; a timed block grabbed near its
 * bottom keeps that offset as it moves.
 */
export type DragGrab = {
  dayOffset: number
  minuteOffset: number
}

/** Timed drops snap to this many minutes. */
export const DRAG_SNAP_MINUTES = 15

/** Pointer travel before a press turns into a drag, so plain clicks still open the event. */
export const DRAG_THRESHOLD_PX = 4

/** Distance from a scroll container's edge within which dragging auto-scrolls it. */
export const AUTOSCROLL_EDGE_PX = 48
const AUTOSCROLL_MAX_STEP_PX = 16

export function grabFor(event: CalendarEvent, hit: DropHit | null): DragGrab {
  if (!hit) return { dayOffset: 0, minuteOffset: 0 }
  return {
    dayOffset: epochDay(hit.day) - event.dateInfo.firstDay,
    minuteOffset: hit.minutes == null ? 0 : hit.minutes - event.dateInfo.startLocalMinutes,
  }
}

/** Duration of a single-day timed event; an event ending at midnight counts to midnight. */
function timedDurationMinutes(event: CalendarEvent): number {
  const { startLocalMinutes, endLocalMinutes, firstDay, endDay } = event.dateInfo
  return endDay > firstDay ? DAY_MINUTES - startLocalMinutes : endLocalMinutes - startLocalMinutes
}

function shiftRange(event: CalendarEvent, days: number, minutes: number): EventTimeRange {
  return {
    start: addDays(addMinutes(event.start, minutes), days),
    end: addDays(addMinutes(event.end, minutes), days),
  }
}

/**
 * The range the event would occupy if dropped at `hit`, or null when the drop
 * is not allowed there or would leave the event exactly where it is.
 */
export function computeDropRange(
  event: CalendarEvent,
  hit: DropHit,
  grab: DragGrab,
): EventTimeRange | null {
  const spanning = isSpanning(event)
  const dayDelta = epochDay(hit.day) - grab.dayOffset - event.dateInfo.firstDay

  if (hit.zone === "timed") {
    if (spanning || hit.minutes == null) return null

    const duration = timedDurationMinutes(event)
    const snapped =
      Math.round((hit.minutes - grab.minuteOffset) / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES
    // Keep the whole event inside the day it was dropped on.
    const maxStart = Math.max(0, DAY_MINUTES - duration)
    const newStart = Math.min(maxStart, Math.max(0, snapped))
    const minuteDelta = newStart - event.dateInfo.startLocalMinutes

    if (dayDelta === 0 && minuteDelta === 0) return null
    return shiftRange(event, dayDelta, minuteDelta)
  }

  if (hit.zone === "all-day" && !spanning) return null
  if (dayDelta === 0) return null
  return shiftRange(event, dayDelta, 0)
}

/**
 * A stand-in rendered at the drop position while dragging. It gets its own id
 * so it never collides with the (still rendered, dimmed) source event in React
 * keys or the active-event tracker.
 */
export function makeDragPreview(event: CalendarEvent, range: EventTimeRange): CalendarEvent {
  return { ...withDates(event, range.start, range.end), id: `${event.id}__drag-preview` }
}

/**
 * How far a scroll container should scroll this frame given the pointer's
 * position: nothing while the pointer is away from its edges, ramping up to a
 * max step as the pointer reaches (or passes just beyond) an edge.
 */
export function edgeScrollDelta(
  rect: { left: number; top: number; right: number; bottom: number },
  x: number,
  y: number,
  axes: { x: boolean; y: boolean },
): { dx: number; dy: number } {
  const edge = AUTOSCROLL_EDGE_PX
  const outside =
    x < rect.left - edge || x > rect.right + edge || y < rect.top - edge || y > rect.bottom + edge
  if (outside) return { dx: 0, dy: 0 }

  const ramp = (depth: number) => Math.ceil(Math.min(1, depth / edge) * AUTOSCROLL_MAX_STEP_PX)
  const along = (pos: number, min: number, max: number) => {
    if (pos < min + edge) return -ramp(min + edge - pos)
    if (pos > max - edge) return ramp(pos - (max - edge))
    return 0
  }

  return {
    dx: axes.x ? along(x, rect.left, rect.right) : 0,
    dy: axes.y ? along(y, rect.top, rect.bottom) : 0,
  }
}
