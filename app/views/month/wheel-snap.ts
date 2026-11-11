/*
 * The month's wheel, landing on week rows. A view listening to `onWheel` takes
 * every wheel over it, touchpad gestures included and with no momentum, so both
 * are handled here: a notch moves one row, and a touchpad follows the fingers,
 * then glides to the row its speed points at, as the old app's fling did.
 */

/** A touchpad gesture's end isn't reported: this long without events ends it. */
export const GESTURE_IDLE_MS = 80
/** Notches this close together add up; a later one starts from where scrolling is. */
export const NOTCH_RUN_MS = 400
const VELOCITY_WINDOW_MS = 100
/** Slower than this when the fingers stop is a placement, not a flick: the nearest row. */
export const FLING_MIN_VELOCITY = 500
// A glide's distance is its speed over this, as WebKitGTK's deceleration was.
const FRICTION = 4
const AHEAD_MIN_PX = 1

const clamp = (offset: number, max: number) => Math.max(0, Math.min(offset, Math.max(0, max)))

export function pickSnapTarget(offset: number, rowHeight: number, maxOffset: number): number {
  return clamp(Math.round(offset / rowHeight) * rowHeight, maxOffset)
}

/** The row a glide from `from` at `velocity` (points a second) lands on, if it moves at all. */
export function pickFlingTarget(
  from: number,
  velocity: number,
  rowHeight: number,
  maxOffset: number,
): number | undefined {
  const direction = Math.sign(velocity)
  if (!direction || rowHeight <= 0) return undefined
  const predicted = clamp(from + velocity / FRICTION, maxOffset)
  let target = Math.round(predicted / rowHeight) * rowHeight
  if ((target - from) * direction < AHEAD_MIN_PX) target += direction * rowHeight
  target = clamp(target, maxOffset)
  return (target - from) * direction < AHEAD_MIN_PX ? undefined : target
}

export type WheelSnapHost = {
  offset(): number
  rowHeight(): number
  maxOffset(): number
  scrollTo(y: number, animated: boolean): void
  now(): number
  setTimer(run: () => void, ms: number): () => void
  /** No easing: every move lands at once. */
  reduceMotion(): boolean
}

export type Wheel = { delta: { y: number }; deltaMode: "points" | "lines" }

export function createWheelSnap(host: WheelSnapHost) {
  let notchTarget: number | null = null
  let gesture: { position: number; samples: { t: number; dy: number }[] } | null = null
  let cancelTimer = () => {}

  const glide = (to: number) => host.scrollTo(to, !host.reduceMotion())

  function notch(dy: number) {
    const row = host.rowHeight()
    const base = notchTarget ?? pickSnapTarget(host.offset(), row, host.maxOffset())
    notchTarget = clamp(base + Math.sign(dy) * row, host.maxOffset())
    glide(notchTarget)
    cancelTimer()
    cancelTimer = host.setTimer(() => (notchTarget = null), NOTCH_RUN_MS)
  }

  function settle() {
    if (!gesture) return
    const { position, samples } = gesture
    gesture = null
    const now = host.now()
    const recent = samples.filter(({ t }) => now - t <= VELOCITY_WINDOW_MS + GESTURE_IDLE_MS)
    const span = recent.length > 1 ? (recent.at(-1)!.t - recent[0]!.t) / 1000 : 0
    const moved = recent.reduce((sum, { dy }) => sum + dy, 0)
    const velocity = span > 0 ? moved / span : 0
    const row = host.rowHeight()
    const max = host.maxOffset()
    const fling =
      Math.abs(velocity) >= FLING_MIN_VELOCITY
        ? pickFlingTarget(position, velocity, row, max)
        : undefined
    const target = fling ?? pickSnapTarget(position, row, max)
    if (target !== position) glide(target)
  }

  function touchpad(dy: number) {
    notchTarget = null
    gesture ??= { position: host.offset(), samples: [] }
    gesture.position = clamp(gesture.position + dy, host.maxOffset())
    gesture.samples.push({ t: host.now(), dy })
    host.scrollTo(gesture.position, false)
    cancelTimer()
    cancelTimer = host.setTimer(settle, GESTURE_IDLE_MS)
  }

  return {
    wheel(event: Wheel) {
      const dy = event.delta.y
      if (dy === 0 || host.rowHeight() <= 0) return
      if (event.deltaMode === "lines") notch(dy)
      else touchpad(dy)
    },
    dispose: () => cancelTimer(),
  }
}
