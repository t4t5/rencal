import { batch, cleanup } from "nsh"

import { plainDateFromEpochDay } from "@/lib/event-time"

import { holdRange } from "@/stores/events"

/**
 * Keeps the events of the days on screen loaded, with `buffer` days around them.
 * The range grows once the view comes within `edge` days of its end, so scrolling
 * reloads now and then rather than constantly; a jump elsewhere replaces it.
 * Returns what the view calls with its first and last epoch day.
 */
export function holdVisibleDays(buffer: number, edge: number) {
  let held: { first: number; last: number } | null = null
  let release = () => {}

  cleanup(() => release())

  return (first: number, last: number) => {
    if (held && first - edge >= held.first && last + edge <= held.last) return
    const near = held && first - buffer <= held.last && last + buffer >= held.first
    const next = {
      first: near ? Math.min(held!.first, first - buffer) : first - buffer,
      last: near ? Math.max(held!.last, last + buffer) : last + buffer,
    }
    held = next
    batch(() => {
      const previous = release
      release = holdRange({
        start: plainDateFromEpochDay(next.first),
        end: plainDateFromEpochDay(next.last + 1),
      })
      previous()
    })
  }
}
