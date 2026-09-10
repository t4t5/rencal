import { createDebugLogger } from "@/lib/debug"

import {
  classifyGesture,
  pickFlingTarget,
  pickSnapTarget,
  SETTLE_IDLE_MS,
  startSnapFling,
  TAKEOVER_COAST_FRAMES,
  TAKEOVER_DECAY_PAIRS,
  WEBKIT_SCROLL_CAPTURE_MS,
} from "./weekSnapFling"

const debugMonthScroll = createDebugLogger("month-scroll")
const traceWheel = createDebugLogger("wheel-trace")
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
type Phase = "idle" | "gesture" | "fling" | "settle"
type Input = "wheel" | "pointer" | "key"
type Sample = { t: number; y: number }

/** Leave direct input native, then take over kinetic scrolling to land on a week. */
export function attachWeekSnapSession(
  el: SnapContainer,
  getState: () => { enabled: boolean; rowHeight: number },
) {
  let phase: Phase = "idle"
  let input: Input = "wheel"
  let timer: ReturnType<typeof setTimeout> | undefined
  let resumeFrame: number | undefined
  let animator: ReturnType<typeof startSnapFling> | undefined
  let moved = false
  let wheelSinceScroll = false
  let coasting = 0
  let precise: boolean | undefined
  let prev: Sample | undefined
  let lastCoast: { delta: number; dt: number; previousDelta?: number } | undefined
  let decayPairs = 0
  const wheelLog: { t: number; deltaY: number; deltaMode: number }[] = []
  const pointers = new Set<number>()
  const keys = new Set<string>()

  const resetSamples = (preserveWheelLog = false) => {
    if (!preserveWheelLog) wheelLog.length = 0
    prev = undefined
    lastCoast = undefined
    decayPairs = 0
    precise = undefined
    coasting = 0
    wheelSinceScroll = false
  }

  const stopAnimation = () => {
    clearTimeout(timer)
    timer = undefined
    animator?.cancel()
    animator = undefined
    delete el.dataset.weekSnap
  }

  const cancel = () => {
    stopAnimation()
    if (resumeFrame !== undefined) cancelAnimationFrame(resumeFrame)
    resumeFrame = undefined
    phase = "idle"
    moved = false
    resetSamples()
  }

  const canSnap = () => {
    const { enabled, rowHeight } = getState()
    return enabled &&
      rowHeight > 0 &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? rowHeight
      : undefined
  }

  const animate = (kind: "fling" | "settle", from: number, velocity: number, to: number) => {
    stopAnimation()
    phase = kind
    el.dataset.weekSnap = kind
    debugMonthScroll("start week snap", { phase, from, velocity, to })
    // This single write aborts WebKit's native kinetic animation before our first frame.
    if (kind === "fling") el.scrollTo({ top: from, behavior: "instant" })
    animator = startSnapFling(el, {
      from,
      velocity,
      to,
      onDone: () => {
        debugMonthScroll("finish week snap", { phase, scrollTop: el.scrollTop, to })
        cancel()
      },
    })
  }

  const schedule = () => {
    clearTimeout(timer)
    timer = undefined
    if (phase !== "gesture" || !moved || pointers.size || keys.size) return
    timer = setTimeout(() => {
      timer = undefined
      const rowHeight = canSnap()
      const from = el.scrollTop
      if (rowHeight === undefined) {
        cancel()
        return
      }
      const to = pickSnapTarget(from, rowHeight, el.scrollHeight - el.clientHeight)
      if (Math.abs(to - from) < 1) cancel()
      else animate("settle", from, 0, to)
    }, SETTLE_IDLE_MS)
  }

  const suspendUntilFrame = () => {
    if (resumeFrame !== undefined) cancelAnimationFrame(resumeFrame)
    resumeFrame = requestAnimationFrame(() => {
      resumeFrame = undefined
    })
  }

  const pause = () => {
    const wasActive = phase !== "idle"
    stopAnimation()
    resetSamples()
    // Geometry alone must not turn a programmatic scroll into a user session.
    phase = wasActive ? "gesture" : "idle"
    suspendUntilFrame()
    schedule()
  }

  const onInput = (nextInput: Input) => {
    const wasIdle = phase === "idle"
    const continuingWheel = phase === "gesture" && input === "wheel" && nextInput === "wheel"
    stopAnimation()
    phase = "gesture"
    input = nextInput
    if (wasIdle) moved = false
    resetSamples(continuingWheel)
    schedule()
  }

  const onWheel = (event: WheelEvent) => {
    traceWheel("wheel", {
      timeStamp: event.timeStamp,
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      wheelDeltaY: (event as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY,
      scrollTop: el.scrollTop,
      wheelSinceScroll,
      phase,
    })
    if (event.ctrlKey || event.deltaY === 0) return
    onInput("wheel")
    wheelSinceScroll = true
    wheelLog.push({ t: event.timeStamp, deltaY: event.deltaY, deltaMode: event.deltaMode })
    while (wheelLog.length && wheelLog[0].t < event.timeStamp - WEBKIT_SCROLL_CAPTURE_MS) {
      wheelLog.shift()
    }
  }

  const decline = (
    reason: "not-precise" | "waiting-for-decay" | "no-target-ahead" | "disabled",
  ) => {
    debugMonthScroll("takeover declined", {
      reason,
      coasting,
      delta: lastCoast?.delta,
      lastDelta: lastCoast?.previousDelta,
    })
    return false
  }

  const takeover = (velocity: number): boolean => {
    const rowHeight = canSnap()
    if (pointers.size || keys.size || rowHeight === undefined) {
      return decline("disabled")
    }
    if (input !== "wheel" || !precise) {
      return decline("not-precise")
    }
    const from = el.scrollTop
    const to = pickFlingTarget(from, velocity, rowHeight, el.scrollHeight - el.clientHeight)
    if (to === undefined) return decline("no-target-ahead")
    animate("fling", from, velocity, to)
    return true
  }

  const tryTakeover = (delta: number, dt: number) => {
    if (coasting < TAKEOVER_COAST_FRAMES || decayPairs < TAKEOVER_DECAY_PAIRS || dt <= 0) {
      decline("waiting-for-decay")
      return
    }
    takeover((delta / dt) * 1000)
  }

  /** A prepend moved the content; carry the session across it instead of tearing it down. */
  const shift = (delta: number) => {
    if (phase === "idle" || delta === 0) return
    debugMonthScroll("shift week snap", { phase, delta, coasting })
    if (animator) {
      animator.shift(delta)
      return
    }
    if (prev) prev = { t: prev.t, y: prev.y + delta }
    suspendUntilFrame()
    // The correction's instant write has stopped WebKit's kinetic animation, so a
    // coasting trackpad fling would otherwise fall silent. Adopt it now.
    if (coasting && lastCoast && lastCoast.dt > 0) {
      takeover((lastCoast.delta / lastCoast.dt) * 1000)
    }
  }

  const onScroll = (event: Event) => {
    traceWheel("scroll", {
      timeStamp: event.timeStamp,
      scrollTop: el.scrollTop,
      wheelSinceScroll,
      phase,
      suspended: resumeFrame !== undefined,
    })
    if (phase === "idle" || resumeFrame !== undefined) return
    if (phase === "fling" || phase === "settle") {
      if (animator && Math.abs(el.scrollTop - animator.lastWritten()) > 1) {
        traceWheel("unexpected scroll during week snap", {
          scrollTop: el.scrollTop,
          lastWritten: animator.lastWritten(),
          phase,
        })
      }
      return
    }
    moved = true
    const sample = { t: event.timeStamp, y: el.scrollTop }
    const previous = prev
    prev = sample
    if (wheelSinceScroll) {
      coasting = 0
      lastCoast = undefined
      decayPairs = 0
      precise = undefined
    } else {
      coasting++
      if (coasting === 1) precise = classifyGesture(wheelLog)
    }
    wheelSinceScroll = false
    schedule()
    if (!coasting || !previous) return

    const delta = sample.y - previous.y
    const dt = sample.t - previous.t
    const lastDelta = lastCoast?.delta
    if (lastCoast) {
      if (
        dt <= 0 ||
        lastCoast.dt <= 0 ||
        delta * lastCoast.delta <= 0 ||
        Math.abs(delta) > Math.abs(lastCoast.delta)
      ) {
        decayPairs = 0
      } else if (Math.abs(delta) < Math.abs(lastCoast.delta)) {
        decayPairs++
      }
      // Equal nonzero deltas neither prove decay nor erase an earlier shrinking pair.
    }
    lastCoast = { delta, dt, previousDelta: lastDelta }
    tryTakeover(delta, dt)
  }

  const onPointerDown = (event: PointerEvent) => {
    pointers.add(event.pointerId)
    onInput("pointer")
  }
  const onPointerUp = (event: PointerEvent) => {
    if (pointers.delete(event.pointerId)) schedule()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (!SCROLL_KEYS.has(event.key)) return
    keys.add(event.key)
    onInput("key")
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (keys.delete(event.key)) schedule()
  }
  const onBlur = () => {
    pointers.clear()
    keys.clear()
    cancel()
  }

  // Interrupt our animation before WebKit handles the new wheel event; never preventDefault.
  el.addEventListener("wheel", onWheel, { passive: false })
  el.addEventListener("scroll", onScroll, { passive: true })
  el.addEventListener("pointerdown", onPointerDown, true)
  el.addEventListener("keydown", onKeyDown)
  window.addEventListener("pointerup", onPointerUp, true)
  window.addEventListener("pointercancel", onPointerUp, true)
  window.addEventListener("keyup", onKeyUp, true)
  window.addEventListener("blur", onBlur)

  return {
    pause,
    shift,
    cancel,
    cleanup() {
      onBlur()
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("scroll", onScroll)
      el.removeEventListener("pointerdown", onPointerDown, true)
      el.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pointerup", onPointerUp, true)
      window.removeEventListener("pointercancel", onPointerUp, true)
      window.removeEventListener("keyup", onKeyUp, true)
      window.removeEventListener("blur", onBlur)
    },
  }
}
