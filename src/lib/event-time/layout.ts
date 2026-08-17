import { epochDay } from "./day"
import {
  instantForOrdering,
  isAllDay,
  toViewerZonedDateTime,
  dateInViewerZone,
} from "./projections"
import type { EventDateInfo, EventTime } from "./types"

/** Epoch-day key for the viewer-local calendar day this event sits on. */
export function dayOf(et: EventTime): number {
  return epochDay(dateInViewerZone(et))
}

function lastOccupiedDay(start: EventTime, end: EventTime, firstDay: number): number {
  const endDay = dayOf(end)
  const endsAtDayBoundary =
    isAllDay(start) || toViewerZonedDateTime(end).toPlainTime().equals("00:00")

  return endsAtDayBoundary && endDay > firstDay ? endDay - 1 : endDay
}

export function computeEventDateInfo(start: EventTime, end: EventTime): EventDateInfo {
  const firstDay = dayOf(start)
  const endDay = dayOf(end)
  const startMs = instantForOrdering(start).epochMilliseconds
  const lastDay = lastOccupiedDay(start, end, firstDay)

  let startLocalMinutes = 0
  let endLocalMinutes = 0
  if (!isAllDay(start)) {
    const startZ = toViewerZonedDateTime(start)
    const endZ = toViewerZonedDateTime(end)
    startLocalMinutes = startZ.hour * 60 + startZ.minute
    endLocalMinutes = endZ.hour * 60 + endZ.minute
  }

  return { startMs, firstDay, lastDay, endDay, startLocalMinutes, endLocalMinutes }
}
