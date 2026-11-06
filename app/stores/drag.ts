/*
 * Direct manipulation of the calendar, one gesture at a time: dragging an event
 * to a new slot, and drawing a new one on empty days. A press only becomes a
 * drag once the pointer has moved a few points, which the responder system
 * decides: until then it's a press, and `onPress` runs as usual. The responder
 * keeps the pointer for the whole drag, so nothing has to swallow the click
 * after a drop.
 *
 * Views register where their days are (`lib/day-hits`) and how to scroll
 * (`setDragScroller`). Event blocks spread `eventDragHandlers`, and the grid
 * around them `createDragHandlers`: blocks are asked first, so a press on one
 * never starts a selection.
 */
import {
  batch,
  computed,
  keymap,
  PanResponder,
  type PanResponderInstance,
  signal,
  untracked,
  type ViewRef,
} from "nsh"

import { getLastEventEndTime } from "@/lib/active-day-draft"
import { eventKey, withDates, type CalendarEvent } from "@/lib/cal-events"
import { dayArea, dayAt, type DayArea, type Rect } from "@/lib/day-hits"
import { draftToCalendarEvent, isDraftEvent } from "@/lib/draft-to-event"
import {
  clampPointToRect,
  type CreateSelection,
  daySelectionForPointer,
  daySelectionRange,
  minutesAtY,
  selectionForPointer,
  selectionRange,
} from "@/lib/drag-to-create"
import {
  computeDropRange,
  type DragGrab,
  DRAG_THRESHOLD_PX,
  type DropHit,
  edgeScrollDelta,
  grabFor,
  makeDragPreview,
} from "@/lib/event-drag"
import { eventPaint } from "@/lib/event-paint"
import {
  addDays,
  addMinutes,
  allDayDate,
  atTime,
  DAY_MINUTES,
  DEFAULT_DURATION_MINS,
  isSameEventTime,
  type EventTimeRange,
  withViewerZone,
} from "@/lib/event-time"
import { isEventReadonly } from "@/lib/event-utils"

import { calendars } from "@/stores/calendar"
import {
  defaultCalendarId,
  draftEvent,
  draftPopoverOpen,
  isDrafting,
  openDraftPopover,
} from "@/stores/draft"
import { calendarEvents, setActiveEventKey } from "@/stores/events"
import { anchorPopoverAt } from "@/stores/popover"
import { requestSave } from "@/stores/recurrence"

type Point = { x: number; y: number }

/** How the floating copy under the pointer is drawn. */
export type DragFloatKind = "pill" | "block"

export type DragFloat = {
  kind: DragFloatKind
  width: number
  height: number
  /** Pointer offset from the block's corner when it was grabbed. */
  offsetX: number
  offsetY: number
}

export type ActiveEventDrag = {
  event: CalendarEvent
  sourceKey: string
  /** Snapped drop range, or null while over somewhere the event can't land. */
  target: EventTimeRange | null
  /** `event` moved to `target`, laid out with the others; null with no target. */
  preview: CalendarEvent | null
  /** Null until the block has been measured. */
  float: DragFloat | null
}

/** What a view offers for edge auto-scroll. */
export type DragScroller = {
  rect: () => Rect
  axes: { x: boolean; y: boolean }
  scrollBy: (dx: number, dy: number) => void
  /** The gesture ended: back to where scrolling normally rests. */
  settle?: () => void
}

const drag = signal<ActiveEventDrag | null>(null)
const selection = signal<CreateSelection | null>(null)
const pointer = signal<Point>({ x: 0, y: 0 })

export const activeDrag = () => drag()
export const dragPointer = () => pointer()
export const createSelection = () => selection()

const shownDraft = computed(() =>
  isDrafting() || draftPopoverOpen() ? draftToCalendarEvent(draftEvent()) : null,
)

/** The events to lay out: the loaded ones, the draft, and the preview of a drag. */
export const displayedEvents = computed(() => {
  const extra = [shownDraft(), drag()?.preview].filter((event) => event != null)
  return extra.length > 0 ? [...calendarEvents(), ...extra] : calendarEvents()
})

/** The flat tint of a range being drawn: the default calendar's. */
export const selectionColor = computed(() => {
  const calendar = calendars().find((candidate) => candidate.slug === defaultCalendarId())
  return `${eventPaint(calendar?.color ?? null).color}33`
})

/** Whether this block is the event being dragged, drawn dimmed, or its preview. */
export function dragRole(event: CalendarEvent): "source" | "preview" | null {
  const current = drag()
  if (!current) return null
  if (current.preview === event) return "preview"
  return eventKey(event) === current.sourceKey ? "source" : null
}

let scroller: DragScroller | null = null

/** Registers how the view on screen scrolls; returns how to forget it. */
export function setDragScroller(next: DragScroller) {
  scroller = next
  return () => {
    if (scroller === next) scroller = null
  }
}

type Gesture = {
  /** Called as the pointer moves or the view scrolls under it. */
  update: () => void
  commit: () => void
  clear: () => void
}

let gesture: Gesture | null = null
let frame: number | undefined
let unbindEscape: (() => void) | null = null

const moved = (g: { dx: number; dy: number }) => Math.hypot(g.dx, g.dy) >= DRAG_THRESHOLD_PX

function autoscroll() {
  frame = requestAnimationFrame(autoscroll)
  if (!scroller) return
  const rect = scroller.rect()
  const { x, y } = untracked(pointer)
  const { dx, dy } = edgeScrollDelta(
    { left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height },
    x,
    y,
    scroller.axes,
  )
  if (!dx && !dy) return
  scroller.scrollBy(dx, dy)
  gesture?.update()
}

function begin(next: Gesture) {
  gesture = next
  next.update()
  frame = requestAnimationFrame(autoscroll)
  unbindEscape = keymap.bind("escape", () => endGesture())
}

/** Stops the gesture. Without `commit`, nothing it did remains. */
export function endGesture(options?: { commit: boolean }) {
  const current = gesture
  if (!current) return
  gesture = null
  cancelAnimationFrame(frame)
  unbindEscape?.()
  unbindEscape = null
  // After Escape the pointer is still down: the release finds no gesture.
  if (options?.commit === true) current.commit()
  batch(current.clear)
  scroller?.settle?.()
}

function hitAt(point: Point): DropHit | null {
  const area = dayAt(point.x, point.y)
  if (!area) return null
  return {
    zone: area.zone,
    day: area.day,
    minutes: area.zone === "timed" ? minutesAtY(topOf(area), point.y) : null,
  }
}

const topOf = (area: DayArea) => ({ top: area.rect.y, height: area.rect.height })

const sameRange = (a: EventTimeRange | null, b: EventTimeRange | null) =>
  !a || !b ? a === b : isSameEventTime(a.start, b.start) && isSameEventTime(a.end, b.end)

export function startEventDrag(
  event: CalendarEvent,
  start: Point,
  kind: DragFloatKind,
  block: ViewRef | undefined,
) {
  const sourceKey = eventKey(event)
  const grab: DragGrab = grabFor(event, hitAt(start))
  let target: EventTimeRange | null = null

  // The popover would otherwise stay open on the event being moved.
  setActiveEventKey(null)
  drag.set({ event, sourceKey, target, preview: null, float: null })

  void block?.measure().then((measured) => {
    if (!measured) return
    const { width, height } = measured.bounds.size
    const float: DragFloat = {
      kind,
      width,
      height,
      offsetX: start.x - measured.pagePosition.x,
      offsetY: start.y - measured.pagePosition.y,
    }
    drag.update((current) => current && { ...current, float })
  })

  begin({
    update() {
      const hit = hitAt(untracked(pointer))
      const range = hit ? computeDropRange(event, hit, grab) : null
      if (sameRange(range, target)) return
      target = range
      drag.update(
        (current) =>
          current && { ...current, target, preview: range && makeDragPreview(event, range) },
      )
    },
    commit() {
      if (!target) return
      // The popover closing at the start may have saved edits to this event.
      const original =
        untracked(calendarEvents).find((other) => eventKey(other) === sourceKey) ?? event
      requestSave(withDates(original, target.start, target.end), original)
    },
    clear: () => drag.set(null),
  })
}

/**
 * The handlers of an event block. `block` is the view itself, to measure, and
 * `kind` how its floating copy looks. They read `event` as they run, so they
 * can stay on a recycled cell.
 */
export function eventDragHandlers(options: {
  event: () => CalendarEvent
  kind: DragFloatKind
  block: () => ViewRef | undefined
}): PanResponderInstance["panHandlers"] {
  let start: Point = { x: 0, y: 0 }
  return PanResponder.create({
    onMoveShouldSetPanResponder(_, g) {
      if (gesture || !moved(g)) return false
      start = { x: g.x0, y: g.y0 }
      return true
    },
    onPanResponderGrant(_, g) {
      pointer.set({ x: g.moveX, y: g.moveY })
      const event = options.event()
      // These still claim the drag: it must not draw a selection.
      if (isDraftEvent(event) || isEventReadonly(event, untracked(calendars))) return
      startEventDrag(event, start, options.kind, options.block())
    },
    onPanResponderMove: follow,
    onPanResponderRelease: () => endGesture({ commit: true }),
    onPanResponderTerminate: () => endGesture(),
  }).panHandlers
}

/** The pointer moved to `point`, in window coordinates. */
export function movePointer(point: Point) {
  pointer.set(point)
  gesture?.update()
}

const follow = (_: unknown, g: { moveX: number; moveY: number }) =>
  movePointer({ x: g.moveX, y: g.moveY })

const sameSelection = (a: CreateSelection | null, b: CreateSelection) => {
  if (a?.kind === "timed" && b.kind === "timed") {
    return a.day.equals(b.day) && a.startMinutes === b.startMinutes && a.endMinutes === b.endMinutes
  }
  if (a?.kind === "days" && b.kind === "days") {
    return a.firstDay.equals(b.firstDay) && a.lastDay.equals(b.lastDay)
  }
  return false
}

/** The selection for a pointer, or null to keep the previous one. */
function selectionAt(anchor: DayArea, minutes: number, point: Point): CreateSelection | null {
  if (anchor.zone === "timed") {
    const column = dayArea(anchor.day, "timed") ?? anchor
    return {
      kind: "timed",
      day: anchor.day,
      ...selectionForPointer(minutes, minutesAtY(topOf(column), point.y)),
    }
  }
  // Clamped so dragging past the grid's edge keeps selecting its edge days.
  const rect = scroller?.rect()
  const inside = rect
    ? clampPointToRect(
        { left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height },
        point.x,
        point.y,
      )
    : point
  const hit = dayAt(inside.x, inside.y)
  if (!hit || hit.zone !== anchor.zone) return null
  return { kind: "days", ...daySelectionForPointer(anchor.day, hit.day) }
}

export function startCreateDrag(anchor: DayArea, start: Point) {
  // Captured now: auto-scroll moves the column under the pointer.
  const minutes = minutesAtY(topOf(anchor), start.y)
  let current: CreateSelection | null = null

  const apply = (point: Point) => {
    const next = selectionAt(anchor, minutes, point)
    if (!next || sameSelection(current, next)) return
    current = next
    selection.set(next)
  }

  // The pressed slot is selected even if the pointer has left it already.
  apply(start)
  begin({
    update: () => apply(untracked(pointer)),
    commit() {
      if (!current) return
      if (current.kind === "days") {
        anchorPopoverAt({ origin: untracked(pointer), size: { width: 0, height: 0 } })
        openDraftPopover(daySelectionRange(current))
        return
      }
      // Beside the middle of the selection, as far as it's on screen.
      const column = dayArea(current.day, "timed") ?? anchor
      const { x, y, width, height } = column.visible ?? column.rect
      const midpoint = (current.startMinutes + current.endMinutes) / 2
      const middle = column.rect.y + (midpoint / DAY_MINUTES) * column.rect.height
      anchorPopoverAt({
        origin: { x, y: Math.max(y, Math.min(y + height, middle)) },
        size: { width, height: 0 },
      })
      const range = selectionRange(current.day, current)
      openDraftPopover({ start: withViewerZone(range.start), end: withViewerZone(range.end) })
    },
    clear: () => selection.set(null),
  })
}

/** The handlers of the view around a grid's days, for drawing new events. */
export function createDragHandlers(): PanResponderInstance["panHandlers"] {
  let anchor: DayArea | null = null
  let start: Point = { x: 0, y: 0 }
  return PanResponder.create({
    onMoveShouldSetPanResponder(_, g) {
      if (gesture || !moved(g)) return false
      start = { x: g.x0, y: g.y0 }
      anchor = dayAt(start.x, start.y)
      // All-day lanes take double clicks and the menu, but no drag.
      return anchor !== null && anchor.zone !== "all-day"
    },
    onPanResponderGrant(_, g) {
      pointer.set({ x: g.moveX, y: g.moveY })
      if (anchor) startCreateDrag(anchor, start)
    },
    onPanResponderMove: follow,
    onPanResponderRelease: () => endGesture({ commit: true }),
    onPanResponderTerminate: () => endGesture(),
  }).panHandlers
}

/** A double click, or the menu's "Create event", at a window point on a day. */
export function createEventAt(point: Point) {
  const area = dayAt(point.x, point.y)
  if (!area) return
  anchorPopoverAt({ origin: point, size: { width: 0, height: 0 } })
  if (area.zone === "all-day") {
    const start = allDayDate(area.day)
    openDraftPopover({ start, end: addDays(start, 1) })
    return
  }
  const hour =
    area.zone === "timed"
      ? Math.max(0, Math.min(23, Math.floor(minutesAtY(topOf(area), point.y) / 60)))
      : null
  const start =
    hour === null
      ? (getLastEventEndTime(area.day, untracked(calendarEvents)) ?? atTime(area.day, 8))
      : atTime(area.day, hour)
  openDraftPopover({
    start: withViewerZone(start),
    end: addMinutes(withViewerZone(start), DEFAULT_DURATION_MINS),
  })
}
