import {
  instantForOrdering,
  isAllDay,
  toViewerZonedDateTime,
  dateInViewerZone,
} from "./projections"
import type { EventDateInfo, EventTime } from "./types"

/** Local-midnight timestamp (ms) of the calendar day this event sits on. */
export function startOfDayMs(et: EventTime): number {
  const date = dateInViewerZone(et)
  return new Date(date.year, date.month - 1, date.day).getTime()
}

export const MS_PER_DAY = 86_400_000

/**
 * Inclusive [firstMs, lastMs] range of local midnights this event occupies.
 * DTEND is exclusive, so an end exactly at midnight belongs to the previous day.
 */
export function getEventDayRange(
  start: EventTime,
  end: EventTime,
): { firstMs: number; lastMs: number } {
  const firstMs = startOfDayMs(start)

  if (isAllDay(start)) {
    const endMs = startOfDayMs(end)
    const lastMs = endMs > firstMs ? endMs - MS_PER_DAY : firstMs
    return { firstMs, lastMs }
  }

  const endInstantMs = instantForOrdering(end).epochMilliseconds
  const endDayMs = startOfDayMs(end)
  const lastMs = endInstantMs === endDayMs && endDayMs > firstMs ? endDayMs - MS_PER_DAY : endDayMs
  return { firstMs, lastMs }
}

export function computeEventDateInfo(start: EventTime, end: EventTime): EventDateInfo {
  const firstDayMs = startOfDayMs(start)
  const endDayMs = startOfDayMs(end)
  const startMs = instantForOrdering(start).epochMilliseconds

  let lastDayMs: number
  if (isAllDay(start)) {
    lastDayMs = endDayMs > firstDayMs ? endDayMs - MS_PER_DAY : firstDayMs
  } else {
    const endInstantMs = instantForOrdering(end).epochMilliseconds
    lastDayMs =
      endInstantMs === endDayMs && endDayMs > firstDayMs ? endDayMs - MS_PER_DAY : endDayMs
  }

  let startLocalMinutes = 0
  let endLocalMinutes = 0
  if (!isAllDay(start)) {
    const startZ = toViewerZonedDateTime(start)
    const endZ = toViewerZonedDateTime(end)
    startLocalMinutes = startZ.hour * 60 + startZ.minute
    endLocalMinutes = endZ.hour * 60 + endZ.minute
  }

  return { startMs, firstDayMs, lastDayMs, endDayMs, startLocalMinutes, endLocalMinutes }
}
