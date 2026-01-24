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

import { rpc } from "@/rpc"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { logger } from "@/lib/logger"

import { CalendarEvent, DateRange, eventDtoToCalendarEvent } from "@/db/types"

interface CalEventsContextType {
  calendarEvents: CalendarEvent[]
  setCalendarEvents: Dispatch<SetStateAction<CalendarEvent[]>>
  reloadEvents: () => Promise<void>
  currentDateRangeRef: RefObject<DateRange | null>
  activeEvent: CalendarEvent | null
  setActiveEventId: Dispatch<SetStateAction<string | null>>
}

const CalEventsContext = createContext({} as CalEventsContextType)

export function useCalEvents() {
  return useContext(CalEventsContext)
}

export function CalEventsProvider({ children }: { children: ReactNode }) {
  const { calendars } = useCalendarState()
  const visibleCalendarSlugs = calendars.filter((c) => c.isVisible).map((c) => c.slug)

  const currentDateRangeRef = useRef<DateRange | null>(null)

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [activeEventId, setActiveEventId] = useState<string | null>(null)

  const activeEvent = calendarEvents.find((e) => e.id === activeEventId) || null

  const reloadEvents = useEffectEvent(async () => {
    // Core data hasn't loaded yet:
    if (!visibleCalendarSlugs.length) {
      return
    }

    try {
      const eventDtos = await rpc.caldir.list_all_events()

      // Convert to CalendarEvent and filter by visible calendars
      const events = eventDtos
        .map(eventDtoToCalendarEvent)
        .filter((e) => visibleCalendarSlugs.includes(e.calendarSlug))

      logger.debug("Events loaded from caldir:", events.length)
      setCalendarEvents(events)
    } catch (error) {
      logger.error("Failed to load events from caldir:", error)
    }
  })

  const value: CalEventsContextType = {
    calendarEvents,
    setCalendarEvents,
    reloadEvents,
    currentDateRangeRef,
    activeEvent,
    setActiveEventId,
  }

  return <CalEventsContext.Provider value={value}>{children}</CalEventsContext.Provider>
}
