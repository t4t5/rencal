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

function previousDayMs(et: EventTime): number {
  const date = dateInViewerZone(et).subtract({ days: 1 })
  return new Date(date.year, date.month - 1, date.day).getTime()
}

function lastOccupiedDayMs(start: EventTime, end: EventTime, firstMs: number): number {
  const endDayMs = startOfDayMs(end)
  const endsAtDayBoundary =
    isAllDay(start) || toViewerZonedDateTime(end).toPlainTime().equals("00:00")

  return endsAtDayBoundary && endDayMs > firstMs ? previousDayMs(end) : endDayMs
}

/**
 * Inclusive [firstMs, lastMs] range of local midnights this event occupies.
 * DTEND is exclusive, so an end exactly at midnight belongs to the previous day.
 */
export function getEventDayRange(
  start: EventTime,
  end: EventTime,
): { firstMs: number; lastMs: number } {
  const firstMs = startOfDayMs(start)
  return { firstMs, lastMs: lastOccupiedDayMs(start, end, firstMs) }
}

export function computeEventDateInfo(start: EventTime, end: EventTime): EventDateInfo {
  const firstDayMs = startOfDayMs(start)
  const endDayMs = startOfDayMs(end)
  const startMs = instantForOrdering(start).epochMilliseconds
  const lastDayMs = lastOccupiedDayMs(start, end, firstDayMs)

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
