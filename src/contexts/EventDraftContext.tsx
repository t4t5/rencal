import { addHours, addMinutes, startOfHour } from "date-fns"
import {
  ReactNode,
  createContext,
  startTransition,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react"

import { rpc } from "@/rpc"
import type { CalendarEvent, Recurrence } from "@/rpc/bindings"

import { logger } from "@/lib/logger"
import { parseEventText } from "@/lib/parse-event-text"
import { formatEventTime } from "@/lib/time"

import { useCalEvents } from "./CalEventsContext"
import { useCalendars } from "./CalendarStateContext"
import { useSync } from "./SyncContext"

interface DraftEvent {
  summary: string
  description: string | null
  allDay: boolean
  start: Date
  end: Date
  calendarId: string | null
  location: string | null
  recurrence: Recurrence | null
}

// Split into two contexts: `text` changes on every keystroke, so anything that
// doesn't need it (NewEventContent, WeekTimeGrid, MonthDayCell, etc.) should
// only subscribe to the draft context to avoid re-rendering while typing.
interface EventTextContextType {
  text: string
  setText: (text: string) => void
}

interface EventDraftContextType {
  isDrafting: boolean
  setIsDrafting: (isDrafting: boolean) => void

  draftPopoverOpen: boolean
  setDraftPopoverOpen: (open: boolean) => void

  defaultCalendarId: string | null

  draftEvent: DraftEvent
  setDraftEvent: (event: DraftEvent) => void

  draftReminders: number[]
  setDraftReminders: (reminders: number[]) => void

  setDefaultDraftEvent: () => void
  createDraftEvent: () => Promise<void>
}

const EventTextContext = createContext({} as EventTextContextType)
const EventDraftContext = createContext({} as EventDraftContextType)

export function useEventText() {
  return useContext(EventTextContext)
}

export function useEventDraft() {
  return useContext(EventDraftContext)
}

const getClosestNextHour = () => startOfHour(addHours(new Date(), 1))

export function EventDraftProvider({ children }: { children: ReactNode }) {
  const { calendars } = useCalendars()
  const [isDrafting, setIsDrafting] = useState(false)
  const [draftPopoverOpen, _setDraftPopoverOpen] = useState(false)

  const defaultCalendarId = calendars[0]?.slug ?? null

  const [text, _setText] = useState("")
  const [draftReminders, setDraftReminders] = useState<number[]>([])
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasParsedTimeRef = useRef(false)

  const generateDefaultDraftEvent = useCallback((): DraftEvent => {
    return {
      summary: "",
      description: null,
      allDay: false,
      start: getClosestNextHour(),
      end: addMinutes(getClosestNextHour(), 30),
      calendarId: defaultCalendarId,
      location: null,
      recurrence: null,
    }
  }, [defaultCalendarId])

  const [draftEvent, setDraftEvent] = useState<DraftEvent>(generateDefaultDraftEvent())

  // Draft updates triggered by typing are wrapped in startTransition so they
  // don't block the urgent text-state render. Without this, the keystroke-time
  // `setDraftEvent` forces NewEventContent (and the ~10 EventInfo subtrees)
  // to re-render on every character.
  const setText = useCallback((newText: string) => {
    _setText(newText)

    if (!hasParsedTimeRef.current) {
      startTransition(() => {
        setDraftEvent((prev) => ({ ...prev, summary: newText }))
      })
    }

    if (parseTimerRef.current) clearTimeout(parseTimerRef.current)
    parseTimerRef.current = setTimeout(() => {
      const parsed = parseEventText(newText)
      hasParsedTimeRef.current =
        parsed.start !== null || parsed.recurrence !== null || parsed.location !== null
      startTransition(() => {
        setDraftEvent((prev) => {
          const updates: Partial<DraftEvent> = {
            summary: parsed.summary,
            recurrence: parsed.recurrence,
            location: parsed.location,
          }
          if (parsed.start) {
            updates.start = parsed.start
            updates.end = parsed.end ?? addMinutes(parsed.start, 30)
            updates.allDay = parsed.allDay
          }
          return { ...prev, ...updates }
        })
      })
    }, 300)
  }, [])

  const setDefaultDraftEvent = useCallback(() => {
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current)
    hasParsedTimeRef.current = false
    setDraftEvent(generateDefaultDraftEvent())
    setDraftReminders([])
  }, [generateDefaultDraftEvent])

  const setDraftPopoverOpen = useCallback(
    (open: boolean) => {
      _setDraftPopoverOpen(open)
      if (!open) setDefaultDraftEvent()
    },
    [setDefaultDraftEvent],
  )

  const { reloadEvents, setCalendarEvents } = useCalEvents()
  const { sync } = useSync()

  const createDraftEvent = useCallback(async () => {
    if (!draftEvent.calendarId) return

    const optimisticId = crypto.randomUUID()

    // Optimistically add to UI immediately
    const optimisticEvent: CalendarEvent = {
      id: optimisticId,
      recurring_event_id: null,
      summary: draftEvent.summary ?? "",
      description: draftEvent.description,
      location: draftEvent.location ?? null,
      start: formatEventTime(draftEvent.start, draftEvent.allDay),
      end: formatEventTime(draftEvent.end, draftEvent.allDay),
      all_day: draftEvent.allDay,
      status: "confirmed",
      recurrence: draftEvent.recurrence,
      master_recurrence: null,
      reminders: draftReminders,
      organizer: null,
      attendees: [],
      conference_url: null,
      calendar_slug: draftEvent.calendarId,
    }
    setCalendarEvents((prev) => [...prev, optimisticEvent])

    logger.info("Create event:", draftEvent)
    setDefaultDraftEvent()
    _setText("")

    const created = await rpc.caldir.create_event({
      calendar_slug: draftEvent.calendarId,
      summary: draftEvent.summary ?? "",
      description: draftEvent.description,
      location: draftEvent.location ?? null,
      start: formatEventTime(draftEvent.start, draftEvent.allDay),
      end: formatEventTime(draftEvent.end, draftEvent.allDay),
      all_day: draftEvent.allDay,
      recurrence: draftEvent.recurrence,
      reminders: draftReminders,
    })

    // Replace optimistic entry with the real event from the backend
    setCalendarEvents((prev) => prev.map((e) => (e.id === optimisticId ? created : e)))
    void sync()
  }, [draftEvent, draftReminders, reloadEvents, sync, setDefaultDraftEvent, setCalendarEvents])

  const textValue = useMemo<EventTextContextType>(() => ({ text, setText }), [text, setText])

  const draftValue = useMemo<EventDraftContextType>(
    () => ({
      isDrafting,
      setIsDrafting,
      draftPopoverOpen,
      setDraftPopoverOpen,
      defaultCalendarId,
      draftEvent,
      setDraftEvent,
      draftReminders,
      setDraftReminders,
      setDefaultDraftEvent,
      createDraftEvent,
    }),
    [
      isDrafting,
      draftPopoverOpen,
      defaultCalendarId,
      draftEvent,
      draftReminders,
      setDefaultDraftEvent,
      setDraftPopoverOpen,
      createDraftEvent,
    ],
  )

  return (
    <EventTextContext.Provider value={textValue}>
      <EventDraftContext.Provider value={draftValue}>{children}</EventDraftContext.Provider>
    </EventTextContext.Provider>
  )
}
