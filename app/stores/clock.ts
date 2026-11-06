// What time it is, as signals: one minute tick drives the agenda's join buttons
// and the day's rollover, since midnight is always on a minute boundary.
import { Temporal } from "@js-temporal/polyfill"
import { cleanup, effect, lifecycle, signal, untracked } from "nsh"

import { api } from "@/lib/api"
import { getViewerTzid, setViewerTzid, subscribeViewerTzid, today } from "@/lib/event-time"

const zone = signal(getViewerTzid())
const day = signal<Temporal.PlainDate>(today(), { equals: (a, b) => a.equals(b) })
const instant = signal(Date.now())

export const viewerTzid = () => zone()
/** Today in the viewer's zone. */
export const currentDay = () => day()
/** The current instant in epoch ms, updated on the minute. */
export const now = () => instant()

function refresh() {
  day.set(today())
  instant.set(Date.now())
}

/** Runs for as long as the component that called it. */
export function startClock() {
  let timer: ReturnType<typeof setTimeout>
  const tick = () => {
    refresh()
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000))
  }
  tick()
  cleanup(() => clearTimeout(timer))

  // Timers stall while the machine sleeps: catch up as soon as the window is back.
  effect(() => {
    if (lifecycle() === "active") untracked(refresh)
  })

  cleanup(
    subscribeViewerTzid(() => {
      zone.set(getViewerTzid())
      refresh()
    }),
  )
  cleanup(api.notifications.listen("system-tz-changed", setViewerTzid).unlisten)
}
