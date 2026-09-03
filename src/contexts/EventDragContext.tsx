/*
 * Drag-to-reschedule state. One drag session at a time: a press on an event
 * block registers a pending session; once the pointer travels past a small
 * threshold the session activates (so plain clicks still open the popover),
 * the source block dims in place, a floating copy follows the pointer, and a
 * preview block renders at the snapped drop position. Releasing commits the
 * move through `requestSave`, which handles optimistic updates, rollback, and
 * the recurring-event dialog exactly like the edit popover does.
 *
 * Drop targets are discovered from the DOM: grid cells/columns declare
 * `data-drop-day` + `data-drop-zone` (see `DropZone` in lib/event-drag), and
 * scroll containers declare `data-drag-scroll` to opt in to edge auto-scroll.
 */
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useRecurrenceEdit } from "@/contexts/RecurrenceEditContext"

import { eventKey, withDates, type CalendarEvent } from "@/lib/cal-events"
import { createDebugLogger } from "@/lib/debug"
import {
  computeDropRange,
  DRAG_THRESHOLD_PX,
  edgeScrollDelta,
  grabFor,
  makeDragPreview,
  type DragGrab,
  type DropHit,
  type DropZone,
} from "@/lib/event-drag"
import {
  DAY_MINUTES,
  dateKeyToPlainDate,
  formatDateKey,
  isSameEventTime,
  type EventTimeRange,
} from "@/lib/event-time"
import { isEventReadonly } from "@/lib/event-utils"

const debugDrag = createDebugLogger("event-drag")

/** How the floating copy under the pointer is drawn. */
export type DragFloatKind = "pill" | "block"

export interface DragFloat {
  kind: DragFloatKind
  width: number
  height: number
  /** Pointer offset from the source block's top-left corner at grab time. */
  offsetX: number
  offsetY: number
}

export interface ActiveEventDrag {
  event: CalendarEvent
  sourceKey: string
  /** Snapped drop range, or null while hovering somewhere the event can't land. */
  target: EventTimeRange | null
  /** `event` moved to `target`, injected into the grid layouts; null with no target. */
  preview: CalendarEvent | null
  float: DragFloat
  /** Pointer position when the drag activated; the overlay seeds from it. */
  pointer: { x: number; y: number }
}

type StartDrag = (
  event: CalendarEvent,
  e: ReactPointerEvent<HTMLElement>,
  opts: { float: DragFloatKind },
) => void

interface EventDragContextValue {
  drag: ActiveEventDrag | null
  startDrag: StartDrag
}

const EventDragContext = createContext<EventDragContextValue | null>(null)

export function useEventDrag(): EventDragContextValue {
  const ctx = useContext(EventDragContext)
  if (!ctx) throw new Error("useEventDrag must be used within EventDragProvider")
  return ctx
}

type DragSession = {
  event: CalendarEvent
  sourceKey: string
  float: DragFloat
  scrollEl: HTMLElement | null
  startX: number
  startY: number
  lastX: number
  lastY: number
  /** Whether the press has turned into a drag. Stays true after Escape so the release click is swallowed. */
  activated: boolean
  cancelled: boolean
  grab: DragGrab
  target: EventTimeRange | null
  raf: number | null
}

function findDropHit(x: number, y: number): DropHit | null {
  // `elementsFromPoint` returns the full stack under the point, so a cell is
  // found even when an event block (a sibling in the grid) sits on top of it.
  const el = document
    .elementsFromPoint(x, y)
    .find(
      (candidate): candidate is HTMLElement =>
        candidate instanceof HTMLElement && candidate.dataset.dropDay !== undefined,
    )
  if (!el) return null

  const zone = el.dataset.dropZone as DropZone | undefined
  const dayKey = el.dataset.dropDay
  if (!zone || !dayKey) return null

  const day = dateKeyToPlainDate(dayKey)
  if (zone !== "timed") return { zone, day, minutes: null }

  const rect = el.getBoundingClientRect()
  return { zone, day, minutes: ((y - rect.top) / rect.height) * DAY_MINUTES }
}

function sameRange(a: EventTimeRange | null, b: EventTimeRange | null): boolean {
  if (!a || !b) return a === b
  return isSameEventTime(a.start, b.start) && isSameEventTime(a.end, b.end)
}

/**
 * The browser fires a click on the common ancestor of the press and release
 * targets, which after a drag would land on a day cell and navigate. Swallow
 * that one click; the listener is dropped right after in case none fires.
 */
function suppressNextClick() {
  const swallow = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
  }
  window.addEventListener("click", swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0)
}

export function EventDragProvider({ children }: { children: ReactNode }) {
  const { calendarEvents, setActiveEventKey } = useCalEvents()
  const { requestSave } = useRecurrenceEdit()
  const [drag, setDrag] = useState<ActiveEventDrag | null>(null)

  const sessionRef = useRef<DragSession | null>(null)
  const requestSaveRef = useRef(requestSave)
  requestSaveRef.current = requestSave
  const calendarEventsRef = useRef(calendarEvents)
  calendarEventsRef.current = calendarEvents

  // Handlers are created once and read everything through refs so the window
  // listeners added at press time can always be removed again.
  const handlers = useMemo(() => {
    const updateTarget = (s: DragSession) => {
      const hit = findDropHit(s.lastX, s.lastY)
      const range = hit ? computeDropRange(s.event, hit, s.grab) : null
      if (sameRange(range, s.target)) return

      s.target = range
      debugDrag("target", {
        zone: hit?.zone,
        day: hit ? formatDateKey(hit.day) : null,
        hasTarget: range !== null,
      })
      setDrag((prev) =>
        prev
          ? { ...prev, target: range, preview: range ? makeDragPreview(s.event, range) : null }
          : prev,
      )
    }

    const autoscrollTick = () => {
      const s = sessionRef.current
      if (!s || !s.activated || s.cancelled) return

      const el = s.scrollEl
      if (el) {
        const { dx, dy } = edgeScrollDelta(el.getBoundingClientRect(), s.lastX, s.lastY, {
          x: el.scrollWidth > el.clientWidth,
          y: el.scrollHeight > el.clientHeight,
        })
        if (dx || dy) {
          el.scrollBy(dx, dy)
          updateTarget(s)
        }
      }
      s.raf = requestAnimationFrame(autoscrollTick)
    }

    const activate = (s: DragSession) => {
      s.activated = true
      s.grab = grabFor(s.event, findDropHit(s.startX, s.startY))
      debugDrag("activate", { event: s.sourceKey, grab: s.grab, float: s.float.kind })

      // The edit popover would otherwise stay open on the event being moved.
      setActiveEventKey(null)
      setDrag({
        event: s.event,
        sourceKey: s.sourceKey,
        target: null,
        preview: null,
        float: s.float,
        pointer: { x: s.lastX, y: s.lastY },
      })
      s.raf = requestAnimationFrame(autoscrollTick)
    }

    const cancel = (s: DragSession) => {
      if (s.cancelled) return
      s.cancelled = true
      s.target = null
      debugDrag("cancel", { event: s.sourceKey })
      setDrag(null)
    }

    const commit = (s: DragSession) => {
      if (!s.target) return
      // Closing the edit popover at activation may have saved other edits to this
      // event in the meantime; move the latest copy so those aren't overwritten.
      const original = calendarEventsRef.current.find((e) => eventKey(e) === s.sourceKey) ?? s.event
      const current = withDates(original, s.target.start, s.target.end)
      debugDrag("commit", { event: s.sourceKey })
      requestSaveRef.current(current, original)
    }

    const cleanup = () => {
      const s = sessionRef.current
      if (!s) return
      if (s.raf !== null) cancelAnimationFrame(s.raf)
      sessionRef.current = null
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerCancel)
      window.removeEventListener("keydown", onKeyDown)
      setDrag(null)
    }

    const onPointerMove = (e: PointerEvent) => {
      const s = sessionRef.current
      if (!s || s.cancelled) return
      s.lastX = e.clientX
      s.lastY = e.clientY

      if (!s.activated) {
        if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < DRAG_THRESHOLD_PX) return
        activate(s)
      }
      updateTarget(s)
    }

    const onPointerUp = () => {
      const s = sessionRef.current
      if (!s) return
      if (s.activated) {
        suppressNextClick()
        if (!s.cancelled) commit(s)
      }
      cleanup()
    }

    const onPointerCancel = () => {
      const s = sessionRef.current
      if (s) cancel(s)
      cleanup()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const s = sessionRef.current
      if (!s || e.key !== "Escape") return
      e.preventDefault()
      cancel(s)
    }

    const start: StartDrag = (event, e, opts) => {
      if (e.button !== 0 || sessionRef.current) return

      const el = e.currentTarget
      const rect = el.getBoundingClientRect()
      sessionRef.current = {
        event,
        sourceKey: eventKey(event),
        float: {
          kind: opts.float,
          width: rect.width,
          height: rect.height,
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top,
        },
        scrollEl: el.closest<HTMLElement>("[data-drag-scroll]"),
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        activated: false,
        cancelled: false,
        grab: { dayOffset: 0, minuteOffset: 0 },
        target: null,
        raf: null,
      }
      window.addEventListener("pointermove", onPointerMove)
      window.addEventListener("pointerup", onPointerUp)
      window.addEventListener("pointercancel", onPointerCancel)
      window.addEventListener("keydown", onKeyDown)
    }

    return { start }
  }, [setActiveEventKey])

  const value = useMemo<EventDragContextValue>(
    () => ({ drag, startDrag: handlers.start }),
    [drag, handlers],
  )

  return <EventDragContext.Provider value={value}>{children}</EventDragContext.Provider>
}

/**
 * `onPointerDown` for an event block, or undefined when the block can't be
 * dragged (drafts, previews, read-only calendars, events the user doesn't own).
 */
export function useEventDragHandle(
  event: CalendarEvent,
  { disabled = false, float = "pill" }: { disabled?: boolean; float?: DragFloatKind } = {},
): ((e: ReactPointerEvent<HTMLElement>) => void) | undefined {
  const { startDrag } = useEventDrag()
  const { calendars } = useCalendars()

  if (disabled || isEventReadonly(event, calendars)) return undefined
  return (e) => startDrag(event, e, { float })
}

export type EventDragRole = "source" | "preview" | null

/** Whether this block is the event being dragged (drawn dimmed) or its drop preview. */
export function useEventDragRole(event: CalendarEvent): EventDragRole {
  const { drag } = useEventDrag()
  if (!drag) return null
  if (drag.preview === event) return "preview"
  if (eventKey(event) === drag.sourceKey) return "source"
  return null
}
