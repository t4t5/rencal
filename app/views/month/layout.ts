/* The month grid's track of weeks, and where events sit in it. */
import { Temporal } from "@js-temporal/polyfill"
import { computed, signal } from "nsh"

import type { CalendarEvent } from "@/lib/cal-events"
import { epochDay, plainDateFromEpochDay, startOfWeek, today } from "@/lib/event-time"
import { isSpanning } from "@/lib/event-utils"
import { type AllDayBar, layoutAllDay } from "@/lib/layout"

import { displayedEvents } from "@/stores/drag"
import { firstDayOfWeek } from "@/stores/settings"

// About ten years either side; rows are virtual, so the track costs nothing.
const HALF_TRACK_WEEKS = 522
export const TRACK_WEEKS = HALF_TRACK_WEEKS * 2

export const MAX_ALL_DAY_LANES = 3
export const MAX_TIMED_VISIBLE = 4
export const LANE_HEIGHT = 20
export const LANE_GAP = 3

export type Spanning = {
  event: CalendarEvent
  firstDay: Temporal.PlainDate
  lastDay: Temporal.PlainDate
}
export type WeekLayout = {
  spanning: Spanning[]
  bars: AllDayBar<Spanning>[]
  timedByCol: CalendarEvent[][]
}

export const EMPTY_WEEK: WeekLayout = {
  spanning: [],
  bars: [],
  timedByCol: Array.from({ length: 7 }, () => []),
}

const center = signal(today(), { equals: (a, b) => a.equals(b) })

/** The first week of the track. */
export const trackOrigin = computed(() =>
  startOfWeek(center(), firstDayOfWeek()).subtract({ weeks: HALF_TRACK_WEEKS }),
)

export const trackIndex = (date: Temporal.PlainDate) =>
  (epochDay(startOfWeek(date, firstDayOfWeek())) - epochDay(trackOrigin())) / 7

/** A jump past the end of the track starts a new one around `date`. */
export const centerTrack = (date: Temporal.PlainDate) => center.set(date)

/** Each event is visited once and placed in the weeks it covers. */
export const weekLayouts = computed(() => {
  const origin = epochDay(trackOrigin())
  const spanning = new Map<number, Spanning[]>()
  const timed = new Map<number, CalendarEvent[][]>()

  for (const event of displayedEvents()) {
    const { firstDay, lastDay } = event.dateInfo
    if (isSpanning(event)) {
      const item = {
        event,
        firstDay: plainDateFromEpochDay(firstDay),
        lastDay: plainDateFromEpochDay(Math.max(firstDay, lastDay)),
      }
      const fromWeek = Math.floor((firstDay - origin) / 7)
      const toWeek = Math.floor((Math.max(firstDay, lastDay) - origin) / 7)
      for (let week = fromWeek; week <= toWeek; week++) {
        spanning.set(week, [...(spanning.get(week) ?? []), item])
      }
    } else {
      const week = Math.floor((firstDay - origin) / 7)
      const columns = timed.get(week) ?? Array.from({ length: 7 }, () => [])
      columns[(((firstDay - origin) % 7) + 7) % 7]?.push(event)
      timed.set(week, columns)
    }
  }

  const layouts = new Map<number, WeekLayout>()
  for (const week of new Set([...spanning.keys(), ...timed.keys()])) {
    const start = plainDateFromEpochDay(origin + week * 7)
    const items = spanning.get(week) ?? []
    const timedByCol = timed.get(week) ?? EMPTY_WEEK.timedByCol
    for (const column of timedByCol) {
      column.sort((a, b) => a.dateInfo.startLocalMinutes - b.dateInfo.startLocalMinutes)
    }
    layouts.set(week, { spanning: items, bars: layoutAllDay(items, start, 7).bars, timedByCol })
  }
  return layouts
})
