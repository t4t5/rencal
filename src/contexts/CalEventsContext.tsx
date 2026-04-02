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

import type { CalendarEvent } from "@/rpc/bindings"

import { useCalendarNavigation, useCalendars } from "@/contexts/CalendarStateContext"

import { getCalendarEventsForRange, getStartRangeForDate } from "@/lib/cal-events-range"
import { DateRange } from "@/lib/types"

interface CalEventsContextType {
  calendarEvents: CalendarEvent[]
  setCalendarEvents: Dispatch<SetStateAction<CalendarEvent[]>>
  reloadEvents: () => Promise<void>
  currentDateRangeRef: RefObject<DateRange | null>
  activeEvent: CalendarEvent | null
  setActiveEventId: Dispatch<SetStateAction<string | null>>
  toggleActiveEventId: (id: string) => void
  isInitialLoading: boolean
}

const CalEventsContext = createContext({} as CalEventsContextType)

export function useCalEvents() {
  return useContext(CalEventsContext)
}

export function CalEventsProvider({ children }: { children: ReactNode }) {
  const { calendars } = useCalendars()
  const { activeDate } = useCalendarNavigation()

  // TODO: respect calendar visibility
  const visibleCalendarIds = calendars.map((c) => c.slug)
  // const visibleCalendarIds = calendars.filter((c) => c.isVisible).map((c) => c.id)

  const currentDateRangeRef = useRef<DateRange | null>(null)

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [activeEventId, setActiveEventId] = useState<string | null>(null)
  const [isInitialLoading, setIsInitialLoading] = useState(true)

  const activeEvent = calendarEvents.find((e) => e.id === activeEventId) || null

  const toggleActiveEventId = useCallback((id: string) => {
    setActiveEventId((prev) => (prev === id ? null : id))
  }, [])

  const reloadEvents = useEffectEvent(async () => {
    // Core data hasn't loaded yet:
    if (!visibleCalendarIds.length || !activeDate) {
      return
    }

    // Use the current (possibly infinite-scroll-expanded) range if available,
    // otherwise compute the initial range from activeDate:
    const range = currentDateRangeRef.current ?? getStartRangeForDate(activeDate)
    currentDateRangeRef.current = range

    const events = await getCalendarEventsForRange(visibleCalendarIds, range.start, range.end)
    setCalendarEvents((prev) => {
      if (JSON.stringify(prev) === JSON.stringify(events)) return prev
      return events
    })
  })

  useEffect(() => {
    if (visibleCalendarIds.length > 0) {
      reloadEvents().then(() => setIsInitialLoading(false))
    }
  }, [visibleCalendarIds.length > 0])

  const value = useMemo<CalEventsContextType>(
    () => ({
      calendarEvents,
      setCalendarEvents,
      reloadEvents,
      currentDateRangeRef,
      activeEvent,
      setActiveEventId,
      toggleActiveEventId,
      isInitialLoading,
    }),
    [calendarEvents, activeEvent, toggleActiveEventId, isInitialLoading],
  )

  return <CalEventsContext.Provider value={value}>{children}</CalEventsContext.Provider>
}
