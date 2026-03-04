import {
  Dispatch,
  ReactNode,
  RefObject,
  SetStateAction,
  createContext,
  useContext,
  useEffectEvent,
  useRef,
  useState,
} from "react"

import type { CalendarEvent } from "@/rpc/bindings"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { getCalendarEventsForRange, getStartRangeForDate } from "@/lib/cal-events-range"

import { DateRange } from "@/db/types"

interface CalEventsContextType {
  calendarEvents: CalendarEvent[]
  setCalendarEvents: Dispatch<SetStateAction<CalendarEvent[]>>
  reloadEvents: () => Promise<void>
  currentDateRangeRef: RefObject<DateRange | null>
  activeEvent: CalendarEvent | null
  setActiveEventId: Dispatch<SetStateAction<string | null>>
  toggleActiveEventId: (id: string) => void
}

const CalEventsContext = createContext({} as CalEventsContextType)

export function useCalEvents() {
  return useContext(CalEventsContext)
}

export function CalEventsProvider({ children }: { children: ReactNode }) {
  const { calendars, activeDate } = useCalendarState()

  // TODO: respect calendar visibility
  const visibleCalendarIds = calendars.map((c) => c.slug)
  // const visibleCalendarIds = calendars.filter((c) => c.isVisible).map((c) => c.id)

  const currentDateRangeRef = useRef<DateRange | null>(null)

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [activeEventId, setActiveEventId] = useState<string | null>(null)

  const activeEvent = calendarEvents.find((e) => e.id === activeEventId) || null

  const toggleActiveEventId = (id: string) => {
    setActiveEventId((prev) => (prev === id ? null : id))
  }

  const reloadEvents = useEffectEvent(async () => {
    const activeRange = getStartRangeForDate(activeDate)

    // Core data hasn't loaded yet:
    if (!visibleCalendarIds.length || !activeDate) {
      return
    }

    currentDateRangeRef.current = activeRange
    const events = await getCalendarEventsForRange(
      visibleCalendarIds,
      activeRange.start,
      activeRange.end,
    )
    setCalendarEvents(events)
  })

  const value: CalEventsContextType = {
    calendarEvents,
    setCalendarEvents,
    reloadEvents,
    currentDateRangeRef,
    activeEvent,
    setActiveEventId,
    toggleActiveEventId,
  }

  return <CalEventsContext.Provider value={value}>{children}</CalEventsContext.Provider>
}
