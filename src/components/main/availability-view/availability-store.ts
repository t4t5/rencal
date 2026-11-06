import { Temporal } from "@js-temporal/polyfill"
import { useSyncExternalStore } from "react"

import { today } from "@/lib/event-time"

import type { DaySegment } from "./day-segments"
import {
  addRange,
  DEFAULT_RANGE,
  moveDay,
  nextDate,
  type PickedDay,
  removeRange,
  setOffered,
  setRange,
} from "./picked-days"

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

export const addDay = () => pickRange(nextDate(state.days, today()), DEFAULT_RANGE)

export const changeDate = (from: Temporal.PlainDate, to: Temporal.PlainDate) =>
  update({ days: moveDay(state.days, from, to) })

export const editRange = (date: Temporal.PlainDate, index: number, range: DaySegment) =>
  update({ days: setRange(state.days, date, index, range) })

export const dropRange = (date: Temporal.PlainDate, index: number) =>
  update({ days: removeRange(state.days, date, index) })

export const tickDay = (date: Temporal.PlainDate, offered: boolean) =>
  update({ days: setOffered(state.days, date, offered) })

export const setDuration = (durationMinutes: number) => update({ durationMinutes })

export const setTheirTzid = (theirTzid: string) => update({ theirTzid })

/** Unticked dates are only kept while you're working in the view. */
export const forgetUnticked = () => update({ days: state.days.filter((day) => day.offered) })
