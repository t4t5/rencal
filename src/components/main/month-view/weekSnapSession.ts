import { createDebugLogger } from "@/lib/debug"

const debugMonthScroll = createDebugLogger("month-scroll")
// Leave room for lifting/repositioning fingers between trackpad swipes.
const SESSION_IDLE_MS = 700
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "])

type SnapContainer = Pick<
  HTMLElement,
  | "addEventListener"
  | "removeEventListener"
  | "dataset"
  | "scrollTop"
  | "scrollHeight"
  | "clientHeight"
  | "scrollTo"
>

/** Align with an explicit native smooth scroll after the input session settles.
 * Re-enabling CSS snapping can jump immediately in WebKitGTK. */
export function attachWeekSnapSession(
  el: SnapContainer,
  getState: () => { enabled: boolean; rowHeight: number },
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let userSession = false
  let moved = false
  const pointers = new Set<number>()
  const keys = new Set<string>()

  const pause = () => {
    clearTimeout(timer)
    if (el.dataset.weekSnap === undefined) return
    delete el.dataset.weekSnap
    // Also abort a settling animation before the browser applies the new input.
    el.scrollTo({ top: el.scrollTop, behavior: "instant" })
    debugMonthScroll("release week snap", { scrollTop: el.scrollTop })
  }

  const cancel = () => {
    userSession = moved = false
    pause()
  }

  const schedule = () => {
    clearTimeout(timer)
    if (!userSession || !moved || pointers.size || keys.size) return
    timer = setTimeout(() => {
      userSession = moved = false
      const { enabled, rowHeight } = getState()
      if (!enabled || rowHeight <= 0) return
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
      const from = el.scrollTop
      const to = Math.max(
        0,
        Math.min(Math.round(from / rowHeight) * rowHeight, el.scrollHeight - el.clientHeight),
      )
      if (Math.abs(to - from) < 1) return
      debugMonthScroll("smooth week snap after input settles", {
        from,
        to,
        idleMs: SESSION_IDLE_MS,
      })
      el.dataset.weekSnap = "settling"
      el.scrollTo({ top: to, behavior: "smooth" })
    }, SESSION_IDLE_MS)
  }

  const onInput = () => {
    pause()
    userSession = true
    schedule()
  }

  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && event.deltaY !== 0) onInput()
  }

  const onScroll = () => {
    if (!userSession) return
    moved = true
    schedule()
  }

  const onPointerDown = (event: PointerEvent) => {
    pointers.add(event.pointerId)
    onInput()
  }
  const onPointerUp = (event: PointerEvent) => {
    if (pointers.delete(event.pointerId)) schedule()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (!SCROLL_KEYS.has(event.key)) return
    keys.add(event.key)
    onInput()
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (keys.delete(event.key)) schedule()
  }
  const onBlur = () => {
    pointers.clear()
    keys.clear()
    cancel()
  }
  const onScrollEnd = () => {
    // The next gesture only needs to abort an animation while it is still running.
    delete el.dataset.weekSnap
  }

  // Non-passive so the animation is interrupted before WebKit handles this wheel event.
  // We never preventDefault or replace the user's scrolling with scrollTop writes.
  el.addEventListener("wheel", onWheel, { passive: false })
  el.addEventListener("scroll", onScroll, { passive: true })
  el.addEventListener("scrollend", onScrollEnd)
  el.addEventListener("pointerdown", onPointerDown, true)
  el.addEventListener("keydown", onKeyDown)
  window.addEventListener("pointerup", onPointerUp, true)
  window.addEventListener("pointercancel", onPointerUp, true)
  window.addEventListener("keyup", onKeyUp, true)
  window.addEventListener("blur", onBlur)

  return {
    // Geometry corrections keep the input session alive but postpone its snap.
    pause,
    cancel,
    cleanup() {
      onBlur()
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("scroll", onScroll)
      el.removeEventListener("scrollend", onScrollEnd)
      el.removeEventListener("pointerdown", onPointerDown, true)
      el.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pointerup", onPointerUp, true)
      window.removeEventListener("pointercancel", onPointerUp, true)
      window.removeEventListener("keyup", onKeyUp, true)
      window.removeEventListener("blur", onBlur)
    },
  }
}
