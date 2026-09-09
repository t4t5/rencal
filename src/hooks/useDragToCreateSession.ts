import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react"

import { suppressNextClick } from "@/contexts/EventDragContext"

import { createDebugLogger } from "@/lib/debug"
import { DRAG_THRESHOLD_PX, edgeScrollDelta } from "@/lib/event-drag"

const debugCreateDrag = createDebugLogger("drag-to-create")

type Pointer = { x: number; y: number }

type Config<TAnchor, TSelection> = {
  scrollContainerRef: RefObject<HTMLElement | null>
  /** Selection for the pointer, or null to keep the previous one. */
  selectionAt: (anchor: TAnchor, originEl: HTMLElement, pointer: Pointer) => TSelection | null
  isSameSelection: (a: TSelection, b: TSelection) => boolean
  onCommit: (
    selection: TSelection,
    anchor: TAnchor,
    originEl: HTMLElement,
    pointer: Pointer,
  ) => void
}

type CreateDragSession<TAnchor, TSelection> = {
  anchor: TAnchor
  originEl: HTMLElement
  scrollEl: HTMLElement | null
  startX: number
  startY: number
  lastX: number
  lastY: number
  activated: boolean
  cancelled: boolean
  selection: TSelection | null
  raf: number | null
}

export function useDragToCreateSession<TAnchor, TSelection>(
  config: Config<TAnchor, TSelection>,
): {
  selection: TSelection | null
  startCreateDrag: (anchor: TAnchor, event: ReactPointerEvent<HTMLElement>) => void
} {
  const [selection, setSelection] = useState<TSelection | null>(null)
  const configRef = useRef(config)
  configRef.current = config
  const sessionRef = useRef<CreateDragSession<TAnchor, TSelection> | null>(null)

  const handlers = useMemo(() => {
    const update = (
      session: CreateDragSession<TAnchor, TSelection>,
      pointer: Pointer = { x: session.lastX, y: session.lastY },
    ) => {
      const next = configRef.current.selectionAt(session.anchor, session.originEl, pointer)
      if (next === null) return
      if (
        session.selection !== null &&
        configRef.current.isSameSelection(session.selection, next)
      ) {
        return
      }
      session.selection = next
      debugCreateDrag("target", { selection: next })
      setSelection(next)
    }

    const autoscrollTick = () => {
      const session = sessionRef.current
      if (!session || !session.activated || session.cancelled) return
      const el = session.scrollEl
      if (el) {
        const { dx, dy } = edgeScrollDelta(
          el.getBoundingClientRect(),
          session.lastX,
          session.lastY,
          {
            x: el.scrollWidth > el.clientWidth,
            y: el.scrollHeight > el.clientHeight,
          },
        )
        if (dx || dy) {
          el.scrollBy(dx, dy)
          update(session)
        }
      }
      session.raf = requestAnimationFrame(autoscrollTick)
    }

    const activate = (session: CreateDragSession<TAnchor, TSelection>) => {
      session.activated = true
      debugCreateDrag("activate", { anchor: session.anchor })
      // Seed the anchor selection before following the current pointer. This
      // guarantees the minimum selection even if activation happens over a gap.
      update(session, { x: session.startX, y: session.startY })
      session.raf = requestAnimationFrame(autoscrollTick)
    }

    const cancel = (session: CreateDragSession<TAnchor, TSelection>) => {
      if (session.cancelled) return
      session.cancelled = true
      session.selection = null
      debugCreateDrag("cancel")
      setSelection(null)
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
        if (!session.cancelled && session.selection !== null) {
          debugCreateDrag("commit", { selection: session.selection })
          configRef.current.onCommit(session.selection, session.anchor, session.originEl, {
            x: session.lastX,
            y: session.lastY,
          })
        }
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

    const start = (anchor: TAnchor, event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || event.target !== event.currentTarget || sessionRef.current) return
      const originEl = event.currentTarget
      sessionRef.current = {
        anchor,
        originEl,
        scrollEl:
          originEl.closest<HTMLElement>("[data-drag-scroll]") ??
          configRef.current.scrollContainerRef.current,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
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
  }, [])

  useEffect(() => handlers.cleanup, [handlers])
  return { selection, startCreateDrag: handlers.start }
}
