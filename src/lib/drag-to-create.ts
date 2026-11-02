import { Temporal } from "@js-temporal/polyfill"

import { DRAG_SNAP_MINUTES } from "@/lib/event-drag"
import { allDayDate, atTime, DAY_MINUTES, type EventTimeRange } from "@/lib/event-time"

type MinuteRange = { startMinutes: number; endMinutes: number }
type DayRange = { firstDay: Temporal.PlainDate; lastDay: Temporal.PlainDate }

/**
 * A range being drawn to create an event: wallclock minutes in one day column,
 * snapped to 15, or an inclusive range of days.
 */
export type CreateSelection =
  | {
      readonly kind: "timed"
      readonly day: Temporal.PlainDate
      readonly startMinutes: number
      readonly endMinutes: number
    }
  | {
      readonly kind: "days"
      readonly firstDay: Temporal.PlainDate
      readonly lastDay: Temporal.PlainDate
    }

/** Inclusive day range that always contains the anchor and grows toward the pointer. */
export function daySelectionForPointer(
  anchor: Temporal.PlainDate,
  pointer: Temporal.PlainDate,
): DayRange {
  return Temporal.PlainDate.compare(anchor, pointer) <= 0
    ? { firstDay: anchor, lastDay: pointer }
    : { firstDay: pointer, lastDay: anchor }
}

/** All-day [start, end) range for a selection. */
export function daySelectionRange(selection: DayRange): EventTimeRange {
  return {
    start: allDayDate(selection.firstDay),
    end: allDayDate(selection.lastDay.add({ days: 1 })),
  }
}

/** Clamp a viewport point just inside a rect so outside drags hit its edge cells. */
export function clampPointToRect(
  rect: DOMRectReadOnly,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: Math.max(rect.left + 1, Math.min(rect.right - 1, x)),
    y: Math.max(rect.top + 1, Math.min(rect.bottom - 1, y)),
  }
}

/** Unclamped wallclock minutes-of-day for a viewport Y inside a day column. */
export function minutesAtY(rect: { top: number; height: number }, y: number): number {
  return ((y - rect.top) / rect.height) * DAY_MINUTES
}

/** Snapped selection that always contains the anchor's slot and grows toward the pointer. */
export function selectionForPointer(anchorMinutes: number, pointerMinutes: number): MinuteRange {
  // Keep even an anchor on the exact bottom edge inside the final slot of the day.
  const anchor = Math.max(0, Math.min(DAY_MINUTES - 1e-9, anchorMinutes))
  const slotStart = Math.floor(anchor / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES
  const slotEnd = slotStart + DRAG_SNAP_MINUTES
  const pointer = Math.max(0, Math.min(DAY_MINUTES, pointerMinutes))

  if (pointer >= slotEnd) {
    return {
      startMinutes: slotStart,
      endMinutes: Math.ceil(pointer / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES,
    }
  }
  if (pointer < slotStart) {
    return {
      startMinutes: Math.floor(pointer / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES,
      endMinutes: slotEnd,
    }
  }
  return { startMinutes: slotStart, endMinutes: slotEnd }
}

/** Build the wallclock range for a selection, treating 24:00 as next-day midnight. */
export function selectionRange(day: Temporal.PlainDate, selection: MinuteRange): EventTimeRange {
  const timeAtMinutes = (minutes: number) => {
    if (minutes === DAY_MINUTES) return atTime(day.add({ days: 1 }), 0)
    return atTime(day, Math.floor(minutes / 60), minutes % 60)
  }

  return {
    start: timeAtMinutes(selection.startMinutes),
    end: timeAtMinutes(selection.endMinutes),
  }
}
