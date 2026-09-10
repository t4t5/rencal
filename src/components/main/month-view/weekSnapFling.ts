// WebKitGTK kinetic scrolling, with a tunable landing curve for week boundaries.
const WEBKIT_DECEL_FRICTION = 4
export const TAKEOVER_COAST_FRAMES = 2
const DECAY_MIN = 4
const DECAY_MAX = 30
export const SETTLE_IDLE_MS = 250
const FLING_MAX_MS = 1500
const DONE_EPSILON_PX = 0.5

const clampOffset = (offset: number, maxOffset: number) =>
  Math.max(0, Math.min(offset, Math.max(0, maxOffset)))

export function predictFlingEnd(from: number, velocity: number, maxOffset: number): number {
  return clampOffset(from + velocity / WEBKIT_DECEL_FRICTION, maxOffset)
}

export function pickSnapTarget(offset: number, rowHeight: number, maxOffset: number): number {
  return clampOffset(Math.round(offset / rowHeight) * rowHeight, maxOffset)
}

export function decayRate(velocity: number, distance: number): number {
  if (velocity === 0 || distance === 0) return DECAY_MIN
  return Math.max(DECAY_MIN, Math.min(Math.abs(velocity / distance), DECAY_MAX))
}

export function startSnapFling(
  el: Pick<HTMLElement, "scrollTo">,
  opts: { from: number; velocity: number; to: number; onDone: () => void },
  clock = {
    now: () => performance.now(),
    // Native frame APIs require a Window receiver, not the injected clock object.
    requestFrame: (callback: FrameRequestCallback) => requestAnimationFrame(callback),
    cancelFrame: (frame: number) => cancelAnimationFrame(frame),
  },
) {
  const { from, velocity, to, onDone } = opts
  const distance = to - from
  const rate = decayRate(velocity, distance)
  const started = clock.now()
  let current = from
  let cancelled = false
  let frame: number

  const tick = (now: number) => {
    if (cancelled) return
    const elapsed = Math.max(0, now - started)
    current = to - distance * Math.exp((-rate * elapsed) / 1000)
    const done = Math.abs(to - current) < DONE_EPSILON_PX || elapsed >= FLING_MAX_MS
    if (done) current = to
    // Keep the fractional offset in JS: integer scrollTop readback can stall the tail.
    el.scrollTo({ top: current, behavior: "instant" })
    if (cancelled) return
    if (done) onDone()
    else frame = clock.requestFrame(tick)
  }
  frame = clock.requestFrame(tick)

  return {
    cancel() {
      cancelled = true
      clock.cancelFrame(frame)
    },
    lastWritten: () => current,
  }
}
