// WebKitGTK kinetic scrolling, with a tunable landing curve for week boundaries.
const WEBKIT_DECEL_FRICTION = 4
export const TAKEOVER_COAST_FRAMES = 2
export const TAKEOVER_DECAY_PAIRS = 1
export const WEBKIT_SCROLL_CAPTURE_MS = 150
const PRECISE_MIN_EVENTS = 3
const SNAP_AHEAD_MIN_PX = 1
const DECAY_MIN = 4
const DECAY_MAX = 30
export const SETTLE_IDLE_MS = 250
const FLING_MAX_MS = 1500
const LANDING_END_VELOCITY = 60

const clampOffset = (offset: number, maxOffset: number) =>
  Math.max(0, Math.min(offset, Math.max(0, maxOffset)))

export function predictFlingEnd(from: number, velocity: number, maxOffset: number): number {
  return clampOffset(from + velocity / WEBKIT_DECEL_FRICTION, maxOffset)
}

export function pickSnapTarget(offset: number, rowHeight: number, maxOffset: number): number {
  return clampOffset(Math.round(offset / rowHeight) * rowHeight, maxOffset)
}

export function pickFlingTarget(
  from: number,
  velocity: number,
  rowHeight: number,
  maxOffset: number,
): number | undefined {
  const direction = Math.sign(velocity)
  if (!direction || rowHeight <= 0) return undefined
  const predicted = predictFlingEnd(from, velocity, maxOffset)
  let target = Math.round(predicted / rowHeight) * rowHeight
  if ((target - from) * direction < SNAP_AHEAD_MIN_PX) target += direction * rowHeight
  target = clampOffset(target, maxOffset)
  return (target - from) * direction < SNAP_AHEAD_MIN_PX ? undefined : target
}

/** DOM events do not expose device precision; use the recent wheel stream as a heuristic. */
export function classifyGesture(
  wheelLog: ReadonlyArray<{ t: number; deltaY: number; deltaMode?: number }>,
): boolean {
  const newest = wheelLog.at(-1)
  if (!newest) return false
  const recent = wheelLog.filter(({ t }) => newest.t - t <= WEBKIT_SCROLL_CAPTURE_MS)
  // Keep explicit line/page input excluded until physical WebKitGTK traces confirm its modes.
  if (recent.some(({ deltaMode = 0 }) => deltaMode !== 0)) return false
  return (
    recent.length >= PRECISE_MIN_EVENTS &&
    new Set(recent.map(({ deltaY }) => Math.abs(deltaY))).size >= 2
  )
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
  // End before the exponential tail creeps, then normalise to cover the full distance.
  const duration = Math.max(0, Math.log((rate * Math.abs(distance)) / LANDING_END_VELOCITY) / rate)
  const scale = -Math.expm1(-rate * duration)
  const started = clock.now()
  let current = from
  let cancelled = false
  let frame: number

  const tick = (now: number) => {
    if (cancelled) return
    const elapsed = Math.max(0, now - started)
    const done = elapsed >= duration * 1000 || elapsed >= FLING_MAX_MS
    current = done ? to : from + distance * (-Math.expm1((-rate * elapsed) / 1000) / scale)
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
