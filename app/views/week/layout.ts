/* The week view's track of days, and where events sit in it. */
import { Temporal } from "@js-temporal/polyfill"
import { computed, signal } from "nsh"

import type { CalendarEvent } from "@/lib/cal-events"
import { DAY_MINUTES, epochDay, plainDateFromEpochDay, startOfWeek, today } from "@/lib/event-time"
import { isSpanning } from "@/lib/event-utils"
import { layoutTimed, type TimedBlock, type TimedRange } from "@/lib/layout"

import { displayedEvents } from "@/stores/drag"
import { firstDayOfWeek } from "@/stores/settings"
import type { Spanning } from "@/views/month/layout"

/** Days on each side of the date the strip opened on: the scrollable track spans twice this. */
const HALF_TRACK_DAYS = 3653
export const TRACK_DAYS = HALF_TRACK_DAYS * 2

export type TimedItem = TimedRange & { event: CalendarEvent }

const center = signal(today(), { equals: (a, b) => a.equals(b) })

/** The first day of the track. */
export const trackOrigin = computed(() => center().subtract({ days: HALF_TRACK_DAYS }))

/** The track index of the first day of `date`'s week. */
export const weekIndex = (date: Temporal.PlainDate) =>
  epochDay(startOfWeek(date, firstDayOfWeek())) - epochDay(trackOrigin())

/** A jump past the end of the track starts a new one around `date`. */
export const centerTrack = (date: Temporal.PlainDate) => center.set(date)

/** Events split once between the all-day lanes and the days' columns. */
export const weekEvents = computed(() => {
  const spanning: Spanning[] = []
  const timed = new Map<number, TimedItem[]>()

  for (const event of displayedEvents()) {
    const { firstDay, lastDay, endDay, startLocalMinutes, endLocalMinutes } = event.dateInfo
    if (isSpanning(event)) {
      spanning.push({
        event,
        firstDay: plainDateFromEpochDay(firstDay),
        lastDay: plainDateFromEpochDay(Math.max(firstDay, lastDay)),
      })
      continue
    }
    const item = {
      event,
      startMinutes: startLocalMinutes,
      endMinutes: (endDay - firstDay) * DAY_MINUTES + endLocalMinutes,
    }
    const day = timed.get(firstDay)
    if (day) day.push(item)
    else timed.set(firstDay, [item])
  }

  const blocks = new Map<number, TimedBlock<TimedItem>[]>()
  for (const [day, items] of timed) blocks.set(day, layoutTimed(items))
  return { spanning, blocks }
})
