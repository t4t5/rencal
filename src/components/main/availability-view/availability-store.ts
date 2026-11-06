import { Temporal } from "@js-temporal/polyfill"
import { useSyncExternalStore } from "react"

import type { DaySegment } from "./day-segments"
import { addRange, type PickedDay, removeRange, setRange } from "./picked-days"

type AvailabilityState = {
  days: PickedDay[]
  durationMinutes: number
  /** The zone the message is written in; null follows your own. */
  theirTzid: string | null
}

// Lives for the session, across leaving and re-entering the view.
let state: AvailabilityState = { days: [], durationMinutes: 30, theirTzid: null }
const listeners = new Set<() => void>()

function update(next: Partial<AvailabilityState>) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useAvailability = () => useSyncExternalStore(subscribe, () => state)

export const pickRange = (date: Temporal.PlainDate, range: DaySegment) =>
  update({ days: addRange(state.days, date, range) })

export const editRange = (date: Temporal.PlainDate, index: number, range: DaySegment) =>
  update({ days: setRange(state.days, date, index, range) })

export const dropRange = (date: Temporal.PlainDate, index: number) =>
  update({ days: removeRange(state.days, date, index) })

export const setDuration = (durationMinutes: number) => update({ durationMinutes })

export const setTheirTzid = (theirTzid: string) => update({ theirTzid })
