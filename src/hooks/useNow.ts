import { Temporal } from "@js-temporal/polyfill"
import { useSyncExternalStore } from "react"

/*
 * One app-wide clock, shared by every subscriber, that ticks on the minute
 * boundary so time-sensitive UI (e.g. the agenda's "Join" buttons) flips the
 * moment the wallclock minute changes. N subscribers cost one timer, not N.
 */

const listeners = new Set<() => void>()
let nowMs = readNow()
let timer: ReturnType<typeof setTimeout> | null = null

function readNow(): number {
  return Temporal.Now.instant().epochMilliseconds
}

function tick() {
  nowMs = readNow()
  for (const listener of listeners) listener()
  scheduleNextMinute()
}

function scheduleNextMinute() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(tick, 60_000 - (readNow() % 60_000))
}

// Timers are throttled while the window is hidden, so catch up as soon as it
// becomes visible again instead of waiting for the stale timeout.
function handleVisibilityChange() {
  if (document.visibilityState === "visible") tick()
}

function subscribe(listener: () => void) {
  listeners.add(listener)

  if (listeners.size === 1) {
    nowMs = readNow()
    scheduleNextMinute()
    document.addEventListener("visibilitychange", handleVisibilityChange)
  }

  return () => {
    listeners.delete(listener)

    if (listeners.size === 0) {
      if (timer) clearTimeout(timer)
      timer = null
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }
}

function getSnapshot(): number {
  return nowMs
}

/** The current instant in epoch ms, re-rendering once per minute. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot)
}
