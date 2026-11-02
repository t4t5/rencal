/*
 * Views mark the elements that stand for a day with `dayAttributes`; renCal
 * finds them in the DOM to drop dragged events, draw new ones, open the
 * new-event popover on double-click or from the context menu, and anchor the
 * "add event on active day" shortcut.
 */
import { Temporal } from "@js-temporal/polyfill"

import { dateKeyToPlainDate, formatDateKey } from "@/lib/event-time"

/**
 * What a day element covers, which decides what lands or is created there:
 *
 * - "day": a whole day, like a month cell. Any event moves there keeping its
 *   time; new events start after the day's last one.
 * - "all-day": a day in an all-day lane. Spanning events only; new events are all-day.
 * - "timed": a day column from 00:00 at its top to 24:00 at its bottom.
 *   Single-day timed events only, at the time under the pointer.
 */
export type DayZone = "day" | "all-day" | "timed"

export function dayAttributes(date: Temporal.PlainDate, zone: DayZone) {
  return { "data-day-key": formatDateKey(date), "data-day-zone": zone } as const
}

export type DayElement = { el: HTMLElement; day: Temporal.PlainDate; zone: DayZone }

function readDay(el: HTMLElement): DayElement | null {
  const { dayKey, dayZone } = el.dataset
  if (!dayKey || !dayZone) return null
  return { el, day: dateKeyToPlainDate(dayKey), zone: dayZone as DayZone }
}

/** The day element under a viewport point, even below an event drawn over it. */
export function dayElementAt(x: number, y: number): DayElement | null {
  const el = document
    .elementsFromPoint(x, y)
    .find(
      (candidate): candidate is HTMLElement =>
        candidate instanceof HTMLElement && candidate.dataset.dayKey !== undefined,
    )
  return el ? readDay(el) : null
}

/** The day element containing `target`. */
export function closestDay(target: EventTarget | null): DayElement | null {
  if (!(target instanceof Element)) return null
  const el = target.closest<HTMLElement>("[data-day-key]")
  return el ? readDay(el) : null
}

/** The largest element marking `date`: a month cell over its header, a week column over its lane. */
export function largestDayElement(date: Temporal.PlainDate): HTMLElement | null {
  const area = (el: HTMLElement) => el.offsetWidth * el.offsetHeight
  const elements = document.querySelectorAll<HTMLElement>(`[data-day-key="${formatDateKey(date)}"]`)
  return Array.from(elements).reduce<HTMLElement | null>(
    (largest, el) => (!largest || area(el) > area(largest) ? el : largest),
    null,
  )
}

/** The nearest ancestor that scrolls, which drags autoscroll near its edges. */
export function scrollParent(el: Element): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node)
    if (/auto|scroll/.test(overflowX + overflowY)) return node
  }
  return null
}
