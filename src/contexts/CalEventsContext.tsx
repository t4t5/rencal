import { listen } from "@tauri-apps/api/event"
import {
  Dispatch,
  ReactNode,
  RefObject,
  SetStateAction,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react"

import { CALDIR_CHANGED } from "@/rpc/events"

import { useCalendarNavigation, useCalendars } from "@/contexts/CalendarStateContext"

import { useVisibleCalendarIds } from "@/hooks/cal-events/useVisibleCalendarIds"
import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import {
  getCalendarEventsForRange,
  getStartRangeForDate,
  mergeEvents,
} from "@/lib/cal-events-range"
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

interface CalEventsContextType {
  calendarEvents: CalendarEvent[]
  setCalendarEvents: Dispatch<SetStateAction<CalendarEvent[]>>
  loadedRangeRef: RefObject<DateRange | null>
  activeEvent: CalendarEvent | null
  setActiveEventKey: Dispatch<SetStateAction<string | null>>
  toggleActiveEventKey: (key: string) => void
  isInitialLoading: boolean
  reloadEvents: () => Promise<void>
  ensureRangeLoaded: (start: Date, end: Date) => Promise<void>
}

const CalEventsContext = createContext({} as CalEventsContextType)

export function useCalEvents() {
  return useContext(CalEventsContext)
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

  const visibleCalendarIds = useVisibleCalendarIds()

  const loadedRangeRef = useRef<DateRange | null>(initialRange ?? null)

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

  // All event loading funnels through one serialized worker so the month grid, the agenda,
  // and jump navigation can't race on calendarEvents / the loaded range. `loadedRangeRef`
  // is the *desired* range (only ever grows); `coveredRangeRef` is what calendarEvents
  // actually holds. The worker reconciles the latter up to the former.
  //
  // Single-in-flight + loop-on-stale guards two failure modes:
  //   (1) Concurrent loads (CALDIR_CHANGED firing repeatedly at startup, plus the
  //       visibleCalendarKey effect and scroll-driven extensions) each replacing
  //       calendarEvents and clobbering each other.
  //   (2) A load capturing the range before its await while a scroll widens it during the
  //       await, then applying events for the stale (narrower) range.
  const coveredRangeRef = useRef<DateRange | null>(
    initialEvents !== undefined ? (initialRange ?? null) : null,
  )
  const isSyncingRef = useRef(false)
  const pendingForceRef = useRef(false)

  const syncEvents = useEffectEvent(async (force: boolean) => {
    // Best-effort: with no calendars the desired range still grew (callers widen it before
    // calling us), so the grid keeps scrolling; there's just nothing to fetch.
    if (!visibleCalendarIds.length || !activeDate) return

    if (isSyncingRef.current) {
      // A sync is already running; it re-reads the refs before finishing, so a widened range
      // is picked up automatically. Only a force-reload needs to be flagged.
      if (force) pendingForceRef.current = true
      return
    }
    isSyncingRef.current = true

    try {
      let doForce = force
      while (true) {
        const desired = loadedRangeRef.current ?? getStartRangeForDate(activeDate)
        loadedRangeRef.current = desired
        const covered = coveredRangeRef.current

        if (doForce || !covered) {
          // Full (re)fetch of the whole desired range.
          const events = await getCalendarEventsForRange(
            visibleCalendarIds,
            desired.start,
            desired.end,
          )
          const latest = loadedRangeRef.current!
          // Range widened or a reload landed mid-flight → redo as a full fetch of the new
          // range rather than applying a now-stale subset.
          if (pendingForceRef.current || latest.start < desired.start || latest.end > desired.end) {
            pendingForceRef.current = false
            doForce = true
            continue
          }
          setCalendarEvents((prev) => (sameEventList(prev, events) ? prev : events))
          coveredRangeRef.current = desired
        } else {
          // Incremental: fetch only the slices outside what's already covered, then merge.
          const needBefore = desired.start < covered.start
          const needAfter = desired.end > covered.end
          if (needBefore || needAfter) {
            const [before, after] = await Promise.all([
              needBefore
                ? getCalendarEventsForRange(visibleCalendarIds, desired.start, covered.start)
                : Promise.resolve<CalendarEvent[]>([]),
              needAfter
                ? getCalendarEventsForRange(visibleCalendarIds, covered.end, desired.end)
                : Promise.resolve<CalendarEvent[]>([]),
            ])
            if (pendingForceRef.current) {
              pendingForceRef.current = false
              doForce = true
              continue
            }
            setCalendarEvents((prev) => {
              let next = prev
              if (before.length) next = mergeEvents(next, before, "prepend")
              if (after.length) next = mergeEvents(next, after, "append")
              return next
            })
            coveredRangeRef.current = {
              start: needBefore ? desired.start : covered.start,
              end: needAfter ? desired.end : covered.end,
            }
          }
        }

        // Synchronous tail (no await before the finally) → race-free with the lock release.
        doForce = pendingForceRef.current
        pendingForceRef.current = false
        const latest = loadedRangeRef.current
        const cov = coveredRangeRef.current
        const coversLatest = !!cov && !!latest && cov.start <= latest.start && cov.end >= latest.end
        if (!doForce && coversLatest) break
      }
    } finally {
      isSyncingRef.current = false
    }
  })

  // Refetch the whole loaded range (content on disk changed, or calendars toggled).
  const reloadEvents = useCallback(() => syncEvents(true), [])

  // Ensure [start, end] is covered, fetching only what's missing. Widens the desired range
  // (never shrinks) and reconciles. Idempotent — safe to call on every scroll/range change.
  const ensureRangeLoaded = useCallback((start: Date, end: Date) => {
    const cur = loadedRangeRef.current
    loadedRangeRef.current = cur
      ? { start: start < cur.start ? start : cur.start, end: end > cur.end ? end : cur.end }
      : { start, end }
    return syncEvents(false)
  }, [])

  const visibleCalendarKey = visibleCalendarIds.join("|")
  useEffect(() => {
    if (skipNextEffectRef.current) {
      skipNextEffectRef.current = false
      return
    }
    if (visibleCalendarKey) {
      reloadEvents().then(() => setIsInitialLoading(false))
    } else if (!isLoadingCalendars) {
      setCalendarEvents([])
      coveredRangeRef.current = null
      setIsInitialLoading(false)
    }
  }, [visibleCalendarKey, isLoadingCalendars])

  useEffect(() => {
    const unlisten = listen(CALDIR_CHANGED, () => {
      void reloadEvents()
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  // Let navigateToDate pull a distant date's events into range before it scrolls there.
  // For dates already covered this resolves without fetching, so nearby jumps stay instant.
  useEffect(() => {
    registerLoadEventsForDate(async (date) => {
      const range = getStartRangeForDate(date)
      await ensureRangeLoaded(range.start, range.end)
    })
  }, [registerLoadEventsForDate, ensureRangeLoaded])

  const value = useMemo<CalEventsContextType>(
    () => ({
      calendarEvents,
      setCalendarEvents,
      loadedRangeRef,
      activeEvent,
      setActiveEventKey,
      toggleActiveEventKey,
      isInitialLoading,
      reloadEvents,
      ensureRangeLoaded,
    }),
    [
      calendarEvents,
      activeEvent,
      toggleActiveEventKey,
      isInitialLoading,
      reloadEvents,
      ensureRangeLoaded,
    ],
  )

  return <CalEventsContext.Provider value={value}>{children}</CalEventsContext.Provider>
}
