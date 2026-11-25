/*
 * Drag-to-reschedule math. Pure helpers shared by the drag controller in
 * `EventDragContext`; DOM hit-testing lives there, not here.
 *
 * A drag moves an event by a whole-day delta (month cells, all-day lanes) and,
 * in the week time grid, an additional wallclock-minute delta. Deltas are
 * applied to both start and end so the duration and the event's own timezone
 * are preserved: dragging never re-zones or re-kinds an event.
 *
 * A drag that starts on the top or bottom edge of a timed block resizes it
 * instead: only that end moves, to the snapped time under the pointer.
 */
import { Temporal } from "@js-temporal/polyfill"

import { withDates, type CalendarEvent } from "@/lib/cal-events"
import type { DayZone } from "@/lib/day-grid"
import { addDays, addMinutes, DAY_MINUTES, epochDay, type EventTimeRange } from "@/lib/event-time"
import { isSpanning } from "@/lib/event-utils"

/** Where the pointer currently is, resolved from the DOM. */
export type DropHit = {
  zone: DayZone
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

    // From the midnight `dayDelta` days in, rolling over into later days: a block
    // grabbed past midnight keeps the event's start on an earlier day than the pointer.
    const snapped = Math.max(
      0,
      Math.round((hit.minutes - grab.minuteOffset) / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES,
    )
    const days = dayDelta + Math.floor(snapped / DAY_MINUTES)
    const minuteDelta = (snapped % DAY_MINUTES) - event.dateInfo.startLocalMinutes

    if (days === 0 && minuteDelta === 0) return null
    return shiftRange(event, days, minuteDelta)
  }

  if (hit.zone === "all-day" && !spanning) return null
  if (dayDelta === 0) return null
  return shiftRange(event, dayDelta, 0)
}

/** Which end of a timed event a resize drag moves. */
export type ResizeEdge = "start" | "end"

/** How close to a timed block's top or bottom edge a press resizes instead of moving. */
const RESIZE_EDGE_PX = 6

/** Blocks shorter than this only resize from the bottom, so the rest of them still moves. */
const RESIZE_BOTH_EDGES_MIN_HEIGHT_PX = 24

/**
 * The edge a press at `y` on a timed block with bounds `rect` would resize, or
 * null to move the block. Used for both the press and the hover cursor, so the
 * cursor always matches what a press does.
 */
export function resizeEdgeAt(rect: { top: number; bottom: number }, y: number): ResizeEdge | null {
  if (y < rect.top || y > rect.bottom) return null
  if (y >= rect.bottom - RESIZE_EDGE_PX) return "end"
  if (rect.bottom - rect.top >= RESIZE_BOTH_EDGES_MIN_HEIGHT_PX && y <= rect.top + RESIZE_EDGE_PX) {
    return "start"
  }
  return null
}

/**
 * The range after dragging the `edge` end of the event to `hit`, snapped like
 * moves and never shorter than one snap step. Null off the time grid, or when
 * the event would keep its current range. The other end keeps its exact value.
 */
export function computeResizeRange(
  event: CalendarEvent,
  hit: DropHit,
  edge: ResizeEdge,
): EventTimeRange | null {
  if (hit.zone !== "timed" || hit.minutes == null) return null

  // Viewer-zone wallclock minutes since the epoch, so a resize can cross midnight.
  const info = event.dateInfo
  const snapped = Math.round(hit.minutes / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES
  const target = epochDay(hit.day) * DAY_MINUTES + snapped
  const start = info.firstDay * DAY_MINUTES + info.startLocalMinutes
  const end = info.endDay * DAY_MINUTES + info.endLocalMinutes

  if (edge === "end") {
    const delta = Math.max(target, start + DRAG_SNAP_MINUTES) - end
    return delta === 0 ? null : { start: event.start, end: addMinutes(event.end, delta) }
  }
  const delta = Math.min(target, end - DRAG_SNAP_MINUTES) - start
  return delta === 0 ? null : { start: addMinutes(event.start, delta), end: event.end }
}

const DRAG_PREVIEW_SUFFIX = "__drag-preview"

/**
 * A stand-in rendered at the drop position while dragging. It gets its own id
 * so it never collides with the source event in React keys or the active-event
 * tracker (the source stays rendered, dimmed, while moving).
 */
export function makeDragPreview(event: CalendarEvent, range: EventTimeRange): CalendarEvent {
  return { ...withDates(event, range.start, range.end), id: `${event.id}${DRAG_PREVIEW_SUFFIX}` }
}

export function isDragPreview(event: CalendarEvent): boolean {
  return event.id.endsWith(DRAG_PREVIEW_SUFFIX)
}

type Axes = { x: boolean; y: boolean }

const overflowingAxes = (el: HTMLElement): Axes => ({
  x: el.scrollWidth > el.clientWidth,
  y: el.scrollHeight > el.clientHeight,
})

export type DragScroll = {
  /** Axes autoscroll may move this frame: overflowing and not `overflow: hidden`. */
  autoscrollAxes: () => Axes
  /** Drops the press listener, in case its mousedown never came. */
  release: () => void
}

/**
 * Sets up scrolling for a drag starting in `scrollEl`. Drags leave `overflow: hidden`
 * axes alone, like the day view's x. WebKit's own drag autoscroll ignores them, and
 * only cancelling the press's mousedown stops it.
 */
export function startDragScroll(scrollEl: HTMLElement | null): DragScroll {
  if (!scrollEl) return { autoscrollAxes: () => ({ x: false, y: false }), release: () => {} }

  const { overflowX, overflowY } = getComputedStyle(scrollEl)
  const hidden = { x: overflowX === "hidden", y: overflowY === "hidden" }
  const autoscrollAxes = () => {
    const overflowing = overflowingAxes(scrollEl)
    return { x: overflowing.x && !hidden.x, y: overflowing.y && !hidden.y }
  }

  const overflowing = overflowingAxes(scrollEl)
  if (!(overflowing.x && hidden.x) && !(overflowing.y && hidden.y)) {
    return { autoscrollAxes, release: () => {} }
  }
  const cancel = (e: MouseEvent) => {
    e.preventDefault()
    // The cancelled press no longer moves focus off whatever had it.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }
  window.addEventListener("mousedown", cancel, { capture: true, once: true })
  return {
    autoscrollAxes,
    release: () => window.removeEventListener("mousedown", cancel, { capture: true }),
  }
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
