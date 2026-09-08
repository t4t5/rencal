import { Temporal } from "@js-temporal/polyfill"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react"

import { suppressNextClick } from "@/contexts/EventDragContext"

import { useOpenDayDraft } from "@/hooks/useOpenDayDraft"
import { createDebugLogger } from "@/lib/debug"
import {
  minutesAtY,
  selectionForPointer,
  selectionRange,
  type CreateSelection,
} from "@/lib/drag-to-create"
import { DRAG_THRESHOLD_PX, edgeScrollDelta } from "@/lib/event-drag"
import { DAY_MINUTES, formatDateKey } from "@/lib/event-time"

const debugCreateDrag = createDebugLogger("drag-to-create")

type ActiveCreateSelection = CreateSelection & { dayKey: string }

type CreateDragSession = {
  day: Temporal.PlainDate
  dayKey: string
  columnEl: HTMLElement
  scrollEl: HTMLElement | null
  startX: number
  startY: number
  lastX: number
  lastY: number
  anchorMinutes: number
  activated: boolean
  cancelled: boolean
  selection: CreateSelection | null
  raf: number | null
}

export function useDragToCreate(scrollContainerRef: RefObject<HTMLDivElement | null>): {
  selection: ActiveCreateSelection | null
  startCreateDrag: (day: Temporal.PlainDate, e: ReactPointerEvent<HTMLElement>) => void
} {
  const [selection, setSelection] = useState<ActiveCreateSelection | null>(null)
  const sessionRef = useRef<CreateDragSession | null>(null)
  const openDayDraft = useOpenDayDraft()
  const openDayDraftRef = useRef(openDayDraft)
  openDayDraftRef.current = openDayDraft

  // Like EventDragContext, these handlers are stable so listeners installed at
  // press time can always be removed using the same function references.
  const handlers = useMemo(() => {
    const update = (session: CreateDragSession) => {
      const next = selectionForPointer(
        session.anchorMinutes,
        minutesAtY(session.columnEl.getBoundingClientRect(), session.lastY),
      )
      if (
        session.selection?.startMinutes === next.startMinutes &&
        session.selection.endMinutes === next.endMinutes
      ) {
        return
      }

      session.selection = next
      debugCreateDrag("target", { day: session.dayKey, ...next })
      setSelection({ dayKey: session.dayKey, ...next })
    }

    const autoscrollTick = () => {
      const session = sessionRef.current
      if (!session || !session.activated || session.cancelled) return

      if (session.scrollEl) {
        const { dy } = edgeScrollDelta(
          session.scrollEl.getBoundingClientRect(),
          session.lastX,
          session.lastY,
          { x: false, y: true },
        )
        if (dy) {
          session.scrollEl.scrollBy(0, dy)
          update(session)
        }
      }
      session.raf = requestAnimationFrame(autoscrollTick)
    }

    const activate = (session: CreateDragSession) => {
      session.activated = true
      debugCreateDrag("activate", {
        day: session.dayKey,
        anchorMinutes: session.anchorMinutes,
      })
      update(session)
      session.raf = requestAnimationFrame(autoscrollTick)
    }

    const cancel = (session: CreateDragSession) => {
      if (session.cancelled) return
      session.cancelled = true
      session.selection = null
      debugCreateDrag("cancel", { day: session.dayKey })
      setSelection(null)
    }

    const commit = (session: CreateDragSession) => {
      if (!session.selection) return
      const range = selectionRange(session.day, session.selection)
      const rect = session.columnEl.getBoundingClientRect()
      const midpointMinutes = (session.selection.startMinutes + session.selection.endMinutes) / 2
      const anchorY = rect.top + (midpointMinutes / DAY_MINUTES) * rect.height

      debugCreateDrag("commit", { day: session.dayKey, ...session.selection })
      openDayDraftRef.current(session.day, session.columnEl, {
        allDay: false,
        start: range.start,
        end: range.end,
        anchorY,
      })
    }

    const cleanup = () => {
      const session = sessionRef.current
      if (!session) return
      if (session.raf !== null) cancelAnimationFrame(session.raf)
      sessionRef.current = null
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerCancel)
      window.removeEventListener("keydown", onKeyDown)
      setSelection(null)
    }

    const onPointerMove = (event: PointerEvent) => {
      const session = sessionRef.current
      if (!session || session.cancelled) return
      session.lastX = event.clientX
      session.lastY = event.clientY

      if (!session.activated) {
        const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY)
        if (distance < DRAG_THRESHOLD_PX) return
        activate(session)
      }
      update(session)
    }

    const onPointerUp = () => {
      const session = sessionRef.current
      if (!session) return
      if (session.activated) {
        suppressNextClick()
        if (!session.cancelled) commit(session)
      }
      cleanup()
    }

    const onPointerCancel = () => {
      const session = sessionRef.current
      if (session) cancel(session)
      cleanup()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const session = sessionRef.current
      if (!session || event.key !== "Escape") return
      event.preventDefault()
      cancel(session)
    }

    const start = (day: Temporal.PlainDate, event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || event.target !== event.currentTarget || sessionRef.current) {
        return
      }

      const columnEl = event.currentTarget
      sessionRef.current = {
        day,
        dayKey: formatDateKey(day),
        columnEl,
        scrollEl: columnEl.closest<HTMLElement>("[data-drag-scroll]") ?? scrollContainerRef.current,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        anchorMinutes: minutesAtY(columnEl.getBoundingClientRect(), event.clientY),
        activated: false,
        cancelled: false,
        selection: null,
        raf: null,
      }
      window.addEventListener("pointermove", onPointerMove)
      window.addEventListener("pointerup", onPointerUp)
      window.addEventListener("pointercancel", onPointerCancel)
      window.addEventListener("keydown", onKeyDown)
    }

    return { cleanup, start }
  }, [scrollContainerRef])

  useEffect(() => handlers.cleanup, [handlers])

  return { selection, startCreateDrag: handlers.start }
}
