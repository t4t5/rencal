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

import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { getCalendarEventsForRange, getStartRangeForDate } from "@/lib/cal-events-range"
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
  currentDateRangeRef: RefObject<DateRange | null>
  activeEvent: CalendarEvent | null
  setActiveEventKey: Dispatch<SetStateAction<string | null>>
  toggleActiveEventKey: (key: string) => void
  isInitialLoading: boolean
  reloadEvents: () => Promise<void>
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
  const { calendars, isLoadingCalendars } = useCalendars()
  const { activeDate } = useCalendarNavigation()

  // TODO: respect calendar visibility
  const visibleCalendarIds = calendars.map((c) => c.slug)
  // const visibleCalendarIds = calendars.filter((c) => c.isVisible).map((c) => c.id)

  const currentDateRangeRef = useRef<DateRange | null>(initialRange ?? null)

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

  // Single-in-flight + loop-on-stale-range. Without this, two failure modes appear:
  //   (1) Multiple concurrent reloads (e.g. CALDIR_CHANGED fires several times during startup,
  //       plus the visibleCalendarKey effect) each await independently and each unconditionally
  //       replaces calendarEvents at the end — clobbering each other.
  //   (2) A reload captures `range` before its await, then onNearTop/onNearBottom extends
  //       currentDateRangeRef.current during the await. The resolve then replaces the merged
  //       (extended) state with events for the *old* range, removing the prepended/appended
  //       events. The user sees the EventList drift as the prepend-shift effect reacts.
  const isReloadingRef = useRef(false)
  const reloadPendingRef = useRef(false)
  const reloadEvents = useEffectEvent(async () => {
    if (!visibleCalendarIds.length || !activeDate) return

    if (isReloadingRef.current) {
      reloadPendingRef.current = true
      return
    }
    isReloadingRef.current = true

    try {
      while (true) {
        reloadPendingRef.current = false
        const range = currentDateRangeRef.current ?? getStartRangeForDate(activeDate)
        currentDateRangeRef.current = range

        const events = await getCalendarEventsForRange(visibleCalendarIds, range.start, range.end)

        // If the range was extended during the await, our fetched events are a stale subset.
        // Don't apply them — refetch with the latest range instead.
        const latest = currentDateRangeRef.current!
        const rangeChanged =
          latest.start.getTime() !== range.start.getTime() ||
          latest.end.getTime() !== range.end.getTime()
        if (rangeChanged) continue

        setCalendarEvents((prev) => (sameEventList(prev, events) ? prev : events))

        if (!reloadPendingRef.current) break
      }
    } finally {
      isReloadingRef.current = false
    }
  })

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

  const reloadEventsStable = useCallback(() => reloadEvents(), [])

  const value = useMemo<CalEventsContextType>(
    () => ({
      calendarEvents,
      setCalendarEvents,
      currentDateRangeRef,
      activeEvent,
      setActiveEventKey,
      toggleActiveEventKey,
      isInitialLoading,
      reloadEvents: reloadEventsStable,
    }),
    [calendarEvents, activeEvent, toggleActiveEventKey, isInitialLoading, reloadEventsStable],
  )

  return <CalEventsContext.Provider value={value}>{children}</CalEventsContext.Provider>
}
