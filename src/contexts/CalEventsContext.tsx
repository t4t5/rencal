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

import { EditEvent } from "@/components/event-info/EditEvent"
import { Sheet, SheetContent } from "@/components/ui/sheet"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { getCalendarEventsForRange, getStartRangeForDate } from "@/lib/cal-events-range"

import { CalendarEvent, DateRange } from "@/db/types"

interface CalEventsContextType {
  calendarEvents: CalendarEvent[]
  setCalendarEvents: Dispatch<SetStateAction<CalendarEvent[]>>
  reloadEvents: () => Promise<void>
  currentDateRangeRef: RefObject<DateRange | null>
  openEvent: (eventId: string) => void
}

const CalEventsContext = createContext({} as CalEventsContextType)

export function useCalEvents() {
  return useContext(CalEventsContext)
}

export function CalEventsProvider({ children }: { children: ReactNode }) {
  const { calendars, activeDate } = useCalendarState()
  const visibleCalendarIds = calendars.filter((c) => c.isVisible).map((c) => c.id)

  const currentDateRangeRef = useRef<DateRange | null>(null)

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [activeEventId, setActiveEventId] = useState<string | null>(null)
  const [showSheet, setShowSheet] = useState(false)

  const activeEvent = calendarEvents.find((e) => e.id === activeEventId) || null

  const reloadEvents = useEffectEvent(async () => {
    const activeRange = getStartRangeForDate(activeDate)

    // Core data hasn't loaded yet:
    if (!visibleCalendarIds.length || !activeDate) {
      return
    }

    currentDateRangeRef.current = activeRange
    const events = await getCalendarEventsForRange(activeRange, visibleCalendarIds)
    setCalendarEvents(events)
  })

  const openEvent = (eventId: string) => {
    setActiveEventId(eventId)
    setShowSheet(true)
  }

  const value: CalEventsContextType = {
    calendarEvents,
    setCalendarEvents,
    reloadEvents,
    currentDateRangeRef,
    openEvent,
  }

  return (
    <CalEventsContext.Provider value={value}>
      {children}
      <Sheet open={showSheet} onOpenChange={setShowSheet}>
        <SheetContent>
          <EditEvent event={activeEvent} />
        </SheetContent>
      </Sheet>
    </CalEventsContext.Provider>
  )
}
