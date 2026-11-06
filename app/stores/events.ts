/*
 * The events in memory. The active range follows the active day; views hold the
 * ranges they show. A reload refetches what is wanted and drops the rest, so
 * `events-changed` from the backend is all that keeps this current.
 */
import { batch, computed, effect, signal, untracked } from "nsh"

import { api } from "@/lib/api"
import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import {
  eventOverlapsRange,
  getStartRangeForDate,
  mergeEvents,
  subtractRanges,
  unionRanges,
} from "@/lib/cal-events-range"
import { subscribeViewerTzid } from "@/lib/event-time"
import type { DateRange } from "@/lib/types"

import { activeDate, visibleSlugs } from "@/stores/calendar"

const loadedEvents = signal<CalendarEvent[]>([])
const activeEventKey = signal<string | null>(null)
const heldRanges = signal<DateRange[]>([])
// Follows `wantedRange` once its events are in, so the agenda never lists a gap.
const activeRangeValue = signal<DateRange>(getStartRangeForDate(activeDate()))
const ready = signal(false)
let wantedRange = untracked(activeRangeValue)

export const calendarEvents = () => loadedEvents()
export const activeRange = () => activeRangeValue()
/** The first load has answered. */
export const eventsReady = () => ready()

export const activeEvent = computed(() => {
  const key = activeEventKey()
  return key ? (loadedEvents().find((event) => eventKey(event) === key) ?? null) : null
})

export const setActiveEventKey = (key: string | null) => activeEventKey.set(key)
export const toggleActiveEventKey = (key: string) =>
  activeEventKey.update((current) => (current === key ? null : key))

export const setCalendarEvents = (update: (events: CalendarEvent[]) => CalendarEvent[]) =>
  loadedEvents.update(update)

/** Keeps `range` loaded until the returned function is called. */
export function holdRange(range: DateRange) {
  heldRanges.update((ranges) => [...ranges, range])
  return () => heldRanges.update((ranges) => ranges.filter((held) => held !== range))
}

let latestLoad = 0
let loadsRunning = 0
let settled: Promise<void> = Promise.resolve()

const fetchRanges = async (ranges: readonly DateRange[], slugs: string[]) =>
  (
    await Promise.all(ranges.map((range) => api.events.list({ calendar_slugs: slugs, range })))
  ).flat()

async function runReload(load: number) {
  const slugs = untracked(visibleSlugs)
  const wanted = wantedRange
  const ranges = unionRanges([wanted, ...untracked(heldRanges)])
  const events = slugs.length > 0 ? await fetchRanges(ranges, slugs) : []
  // A newer load has the fresher answer.
  if (load !== latestLoad) return
  const byKey = new Map(events.map((event) => [eventKey(event), event]))
  batch(() => {
    loadedEvents.set([...byKey.values()].sort((a, b) => a.dateInfo.startMs - b.dateInfo.startMs))
    activeRangeValue.set(wanted)
    ready.set(true)
  })
}

const track = (load: Promise<void>) => {
  loadsRunning += 1
  const done = load.finally(() => void (loadsRunning -= 1))
  settled = Promise.all([settled, done]).then(() => undefined)
  return done
}

export function reloadEvents() {
  return track(runReload(++latestLoad))
}

/** Resolves once every load started so far has answered. */
export const eventsSettled = () => settled

/**
 * Widens the active range, fetching only what it adds. A reload already running
 * would drop those events when it lands, so that case reloads instead.
 */
export function extendActiveRange(update: (range: DateRange) => DateRange) {
  const [extended] = unionRanges([wantedRange, update(wantedRange)])
  const added = subtractRanges([extended!], [wantedRange])
  if (added.length === 0) return settled
  wantedRange = extended!
  if (loadsRunning > 0) return reloadEvents()

  const load = latestLoad
  const fetchAdded = async () => {
    const slugs = untracked(visibleSlugs)
    const events = slugs.length > 0 ? await fetchRanges(added, slugs) : []
    if (load !== latestLoad) return
    batch(() => {
      loadedEvents.update((current) => mergeEvents(current, events))
      activeRangeValue.update((range) => unionRanges([range, ...added])[0] ?? range)
    })
  }
  return track(fetchAdded())
}

export function startEventStore() {
  effect(() => {
    visibleSlugs()
    heldRanges()
    void reloadEvents()
  })
  // A jump next to the active range extends it; a farther one moves it, so the months
  // in between aren't loaded.
  effect(() => {
    const target = getStartRangeForDate(activeDate())
    const joined = unionRanges([wantedRange, target])
    if (joined.length > 1) {
      wantedRange = target
      void reloadEvents()
    } else {
      void extendActiveRange(() => target)
    }
  })
  api.notifications.listen("events-changed", () => void reloadEvents())
  subscribeViewerTzid(() => void reloadEvents())
}

/** The loaded events the agenda lists. */
export const agendaEvents = computed(() =>
  loadedEvents().filter((event) => eventOverlapsRange(event, activeRangeValue())),
)
