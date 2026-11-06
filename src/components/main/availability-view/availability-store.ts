import { Temporal } from "@js-temporal/polyfill"
import { useSyncExternalStore } from "react"

import type { DaySegment } from "./day-segments"
import { addRange, type PickedDay, removeRange, setOffered, setRange } from "./picked-days"

type HoveredRange = { date: Temporal.PlainDate; range: DaySegment }

type AvailabilityState = {
  days: PickedDay[]
  durationMinutes: number
  /** The zone the message is written in; null follows your own. */
  theirTzid: string | null
  /** The picked time hovered in the panel, highlighted on the calendar. */
  hovered: HoveredRange | null
}

// Lives for the session, across leaving and re-entering the view.
let state: AvailabilityState = { days: [], durationMinutes: 30, theirTzid: null, hovered: null }
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
  update({ days: setRange(state.days, date, index, range), hovered: null })

export const dropRange = (date: Temporal.PlainDate, index: number) =>
  // The removed row unmounts before it can report the pointer leaving.
  update({ days: removeRange(state.days, date, index), hovered: null })

export const tickDay = (date: Temporal.PlainDate, offered: boolean) =>
  update({ days: setOffered(state.days, date, offered), hovered: null })

export const setDuration = (durationMinutes: number) => update({ durationMinutes })

export const setTheirTzid = (theirTzid: string) => update({ theirTzid })

export const setHovered = (hovered: HoveredRange | null) => update({ hovered })

/** Unticked dates are only kept while you're working in the view. */
export const forgetUnticked = () => update({ days: state.days.filter((day) => day.offered) })
