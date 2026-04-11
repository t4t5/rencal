import { addHours, addMinutes, startOfHour } from "date-fns"
import { ReactNode, createContext, useCallback, useContext, useRef, useState } from "react"

import { rpc } from "@/rpc"
import type { Recurrence } from "@/rpc/bindings"

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

interface EventDraftContextType {
  isDrafting: boolean
  setIsDrafting: (isDrafting: boolean) => void

  draftPopoverOpen: boolean
  setDraftPopoverOpen: (open: boolean) => void

  defaultCalendarId: string | null

  text: string
  setText: (text: string) => void

  draftEvent: DraftEvent
  setDraftEvent: (event: DraftEvent) => void

  draftReminders: number[]
  setDraftReminders: (reminders: number[]) => void

  setDefaultDraftEvent: () => void
  createDraftEvent: () => Promise<void>
}

const EventDraftContext = createContext({} as EventDraftContextType)

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

  const setText = (newText: string) => {
    _setText(newText)

    if (!hasParsedTimeRef.current) {
      setDraftEvent((prev) => ({ ...prev, summary: newText }))
    }

    if (parseTimerRef.current) clearTimeout(parseTimerRef.current)
    parseTimerRef.current = setTimeout(() => {
      const parsed = parseEventText(newText)
      hasParsedTimeRef.current =
        parsed.start !== null || parsed.recurrence !== null || parsed.location !== null
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
    }, 300)
  }

  const setDefaultDraftEvent = () => {
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current)
    hasParsedTimeRef.current = false
    setDraftEvent(generateDefaultDraftEvent())
    setDraftReminders([])
  }

  const setDraftPopoverOpen = (open: boolean) => {
    _setDraftPopoverOpen(open)
    if (!open) setDefaultDraftEvent()
  }

  const { reloadEvents } = useCalEvents()
  const { sync } = useSync()

  const createDraftEvent = useCallback(async () => {
    if (!draftEvent.calendarId) return

    await rpc.caldir.create_event({
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

    logger.info("Create event:", draftEvent)
    setDefaultDraftEvent()
    _setText("")
    await reloadEvents()
    void sync()
  }, [draftEvent, draftReminders, reloadEvents, sync, setDefaultDraftEvent])

  const value = {
    isDrafting,
    setIsDrafting,
    draftPopoverOpen,
    setDraftPopoverOpen,
    defaultCalendarId,
    text,
    setText,
    draftEvent,
    setDraftEvent,
    draftReminders,
    setDraftReminders,
    setDefaultDraftEvent,
    createDraftEvent,
  }

  return <EventDraftContext.Provider value={value}>{children}</EventDraftContext.Provider>
}
