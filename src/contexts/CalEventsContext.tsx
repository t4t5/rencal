import { Temporal } from "@js-temporal/polyfill"
import {
  Dispatch,
  ReactNode,
  SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { useCalendarNavigation, useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { useVisibleCalendarIds } from "@/hooks/cal-events/useVisibleCalendarIds"
import { useEventDeepLinks } from "@/hooks/useEventDeepLinks"
import { api } from "@/lib/api"
import { eventKey, withDates, type CalendarEvent } from "@/lib/cal-events"
import {
  getStartRangeForDate,
  mergeEvents,
  subtractRanges,
  unionRanges,
} from "@/lib/cal-events-range"
import { epochDay, plainDateFromEpochDay, subscribeViewerTzid } from "@/lib/event-time"
import { createStrictContext } from "@/lib/strict-context"
import { DateRange } from "@/lib/types"

// Cheap identity check used to skip no-op state updates after a reload. The
// previous JSON.stringify-based dedup was correct but cost tens of ms per call
// at thousands-of-events scale (see CalEventsContext list_events flow).
// Both arrays come back sorted by start time from the backend, so we can scan
// position-by-position. `updated` is RFC 3339 of DTSTAMP/LAST-MODIFIED — bumps
// on any real edit, so different content yields a different tuple.
function sameEventList(a: CalendarEvent[], b: CalendarEvent[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (eventKey(a[i]) !== eventKey(b[i]) || a[i].updated !== b[i].updated) return false
  }
  return true
}

async function fetchRanges(
  calendarSlugs: string[],
  ranges: readonly DateRange[],
): Promise<CalendarEvent[]> {
  const lists = await Promise.all(
    ranges.map((range) => api.events.list({ calendar_slugs: calendarSlugs, range })),
  )
  // A single list keeps the backend's order, which `sameEventList` compares against.
  return lists.length === 1 ? lists[0] : lists.reduce(mergeEvents, [])
}

interface CalEventsContextType {
  calendarEvents: CalendarEvent[]
  setCalendarEvents: Dispatch<SetStateAction<CalendarEvent[]>>
  /**
   * The span around the active date that the agenda lists. Published once its events
   * have loaded; `calendarEvents` can also hold events outside it.
   */
  activeRange: DateRange
  /** Widen the active range to (at least) what `update` returns, and load it. */
  extendActiveRange: (update: (range: DateRange) => DateRange) => Promise<void>
  /** Keep `range` loaded until the returned release function is called. */
  holdRange: (range: DateRange) => () => void
  activeEvent: CalendarEvent | null
  setActiveEventKey: Dispatch<SetStateAction<string | null>>
  toggleActiveEventKey: (key: string) => void
  isInitialLoading: boolean
  reloadEvents: () => Promise<void>
}

const [CalEventsContextProvider, useCalEvents] =
  createStrictContext<CalEventsContextType>("CalEvents")

export { useCalEvents }

/**
 * Keep events overlapping [start, end) loaded while the caller is mounted. Every view
 * holds the range it renders; a reload refetches only held ranges and drops the rest.
 */
export function useHoldRange(start: Temporal.PlainDate, end: Temporal.PlainDate) {
  const { holdRange } = useCalEvents()
  const first = epochDay(start)
  const last = epochDay(end)

  useEffect(
    () => holdRange({ start: plainDateFromEpochDay(first), end: plainDateFromEpochDay(last) }),
    [first, last, holdRange],
  )
}

interface CalEventsProviderProps {
  children: ReactNode
  initialEvents?: CalendarEvent[]
  initialRange?: DateRange
}

export function CalEventsProvider({
  children,
  initialEvents,
  initialRange,
}: CalEventsProviderProps) {
  const { isLoadingCalendars } = useCalendars()
  const { activeDate, registerLoadEventsForDate } = useCalendarNavigation()
  const { settingsLoaded } = useSettings()

  const visibleCalendarIds = useVisibleCalendarIds()
  const visibleCalendarKey = visibleCalendarIds.join("|")
  const loadInputsRef = useRef({ visibleCalendarIds, visibleCalendarKey })
  useLayoutEffect(() => {
    loadInputsRef.current = { visibleCalendarIds, visibleCalendarKey }
  }, [visibleCalendarIds, visibleCalendarKey])

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() => initialEvents ?? [])
  // Holds the active event's `eventKey` (calendar_slug + id), not the raw `id` —
  // the same event can exist in two calendars, so `id` alone isn't unique.
  const [activeEventKey, setActiveEventKey] = useState<string | null>(null)
  const [isInitialLoading, setIsInitialLoading] = useState(() => initialEvents === undefined)
  const skipNextEffectRef = useRef(initialEvents !== undefined)

  const activeEvent = calendarEvents.find((e) => eventKey(e) === activeEventKey) || null

  const toggleActiveEventKey = useCallback((key: string) => {
    setActiveEventKey((prev) => (prev === key ? null : key))
  }, [])

  // What to load is the active range plus every range a view holds. `activeRangeRef` is
  // the latest requested active range; `activeRange` follows it once its events are in.
  const [activeRange, setActiveRange] = useState(
    () => initialRange ?? getStartRangeForDate(activeDate),
  )
  const activeRangeRef = useRef(activeRange)
  const heldRangesRef = useRef(new Set<DateRange>())
  const wantedRanges = useCallback(
    () => unionRanges([activeRangeRef.current, ...heldRangesRef.current]),
    [],
  )

  // All event loading funnels through one serialized worker so views, the agenda and jump
  // navigation can't race on calendarEvents. `coveredRef` is the range set calendarEvents
  // actually holds; the worker fetches what's wanted but not covered. Incremental loads
  // only add coverage, while a full reload fetches just the wanted ranges, which drops
  // the ones nothing holds any more.
  //
  // Single-in-flight + loop-on-stale guards two failure modes:
  //   (1) Concurrent loads (visibleCalendarKey changes plus scroll-driven extensions)
  //       each replacing calendarEvents and clobbering each other.
  //   (2) A load capturing the wanted ranges before its await while a scroll widens them
  //       during the await, then treating the newer ranges as covered.
  const coveredRef = useRef<DateRange[] | null>(
    initialEvents !== undefined && initialRange ? [initialRange] : null,
  )
  const isSyncingRef = useRef(false)
  const syncPromiseRef = useRef<Promise<void>>(Promise.resolve())
  const pendingForceRef = useRef(false)

  const runSync = useCallback(async (force: boolean) => {
    try {
      let doForce = force
      while (true) {
        // Re-read the committed selection on every retry, not the one that started the load.
        const { visibleCalendarIds, visibleCalendarKey } = loadInputsRef.current
        // The visibility effect clears events/coverage for an empty selection. An old fetch
        // must stop here rather than putting its events back after that clear.
        if (!visibleCalendarIds.length) return

        const wanted = wantedRanges()
        const covered = coveredRef.current
        const fetching = doForce || !covered ? wanted : subtractRanges(wanted, covered)

        if (fetching.length) {
          const events = await fetchRanges(visibleCalendarIds, fetching)
          // Selection changed or a reload landed mid-flight → redo as a full fetch rather
          // than applying stale results.
          if (
            pendingForceRef.current ||
            visibleCalendarKey !== loadInputsRef.current.visibleCalendarKey
          ) {
            pendingForceRef.current = false
            doForce = true
            continue
          }
          if (doForce || !covered) {
            setCalendarEvents((prev) => (sameEventList(prev, events) ? prev : events))
            coveredRef.current = fetching
          } else {
            setCalendarEvents((prev) => mergeEvents(prev, events))
            coveredRef.current = unionRanges([...covered, ...fetching])
          }
        }

        // Synchronous tail (no await before the finally) → race-free with the lock release.
        const cov = coveredRef.current
        if (cov && !subtractRanges([activeRangeRef.current], cov).length) {
          setActiveRange(activeRangeRef.current)
        }
        doForce = pendingForceRef.current
        pendingForceRef.current = false
        if (!doForce && cov && !subtractRanges(wantedRanges(), cov).length) break
      }
    } finally {
      isSyncingRef.current = false
    }
  }, [])

  // Resolves once everything wanted at the time of the call is loaded. A sync that's
  // already running re-reads the ranges before finishing, so it picks up this request.
  const syncEvents = useCallback(
    (force: boolean) => {
      if (isSyncingRef.current) {
        if (force) pendingForceRef.current = true
        return syncPromiseRef.current
      }
      isSyncingRef.current = true
      syncPromiseRef.current = runSync(force)
      return syncPromiseRef.current
    },
    [runSync],
  )

  // Refetch everything wanted (content on disk changed, or calendars toggled).
  const reloadEvents = useCallback(() => syncEvents(true), [syncEvents])

  const extendActiveRange = useCallback(
    (update: (range: DateRange) => DateRange) => {
      const [extended] = unionRanges([activeRangeRef.current, update(activeRangeRef.current)])
      activeRangeRef.current = extended
      return syncEvents(false)
    },
    [syncEvents],
  )

  const holdRange = useCallback(
    (range: DateRange) => {
      // A fresh object per hold, so two views holding the same range release independently.
      const held = { ...range }
      heldRangesRef.current.add(held)
      void syncEvents(false)
      return () => {
        heldRangesRef.current.delete(held)
      }
    },
    [syncEvents],
  )

  useEffect(() => {
    // `useVisibleCalendarIds` returns [] until settings/groups have loaded. Don't treat
    // that transient startup state as "no visible calendars", otherwise the preloaded
    // agenda data is cleared before the one-shot initial scroll runs.
    if (!settingsLoaded) return

    if (skipNextEffectRef.current) {
      skipNextEffectRef.current = false
      // The preload covers the active range; ranges held before any calendar was
      // visible still need loading.
      void syncEvents(false)
      return
    }
    if (visibleCalendarKey) {
      reloadEvents().then(() => setIsInitialLoading(false))
    } else if (!isLoadingCalendars) {
      setCalendarEvents([])
      coveredRef.current = null
      setIsInitialLoading(false)
    }
  }, [visibleCalendarKey, isLoadingCalendars, settingsLoaded])

  useEffect(() => {
    const unlisten = api.notifications.listen("events-changed", () => {
      void reloadEvents()
    })
    return () => {
      unlisten.unlisten()
    }
  }, [reloadEvents])

  // Each event's `dateInfo` bakes in the viewer's zone at conversion time, so an OS
  // timezone change must recompute it for every held event. The events themselves
  // are unchanged on disk — only the projections shift.
  useEffect(
    () =>
      subscribeViewerTzid(() => {
        setCalendarEvents((prev) => prev.map((e) => withDates(e, e.start, e.end)))
      }),
    [],
  )

  // Let navigateToDate pull a distant date's events into range before it scrolls there.
  // A jump that lands next to the active range extends it; a farther one moves it, so the
  // months in between aren't loaded. Covered dates resolve without fetching.
  useEffect(() => {
    registerLoadEventsForDate((date) => {
      const target = getStartRangeForDate(date)
      const joined = unionRanges([activeRangeRef.current, target])
      activeRangeRef.current = joined.length === 1 ? joined[0] : target
      return syncEvents(false)
    })
  }, [registerLoadEventsForDate, syncEvents])

  const value = useMemo<CalEventsContextType>(
    () => ({
      calendarEvents,
      setCalendarEvents,
      activeRange,
      extendActiveRange,
      holdRange,
      activeEvent,
      setActiveEventKey,
      toggleActiveEventKey,
      isInitialLoading,
      reloadEvents,
    }),
    [
      calendarEvents,
      activeRange,
      extendActiveRange,
      holdRange,
      activeEvent,
      toggleActiveEventKey,
      isInitialLoading,
      reloadEvents,
    ],
  )

  return (
    <CalEventsContextProvider value={value}>
      <EventDeepLinkListener />
      {children}
    </CalEventsContextProvider>
  )
}

function EventDeepLinkListener() {
  useEventDeepLinks()
  return null
}
