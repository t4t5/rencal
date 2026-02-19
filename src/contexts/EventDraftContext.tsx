import { addHours, addMinutes, startOfHour } from "date-fns"
import { ReactNode, createContext, useCallback, useContext, useState } from "react"

import type { Recurrence } from "@/rpc/bindings"

import { useCalendarState } from "./CalendarStateContext"

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

  text: string
  setText: (text: string) => void

  draftEvent: DraftEvent
  setDraftEvent: (event: DraftEvent) => void

  draftReminders: number[]
  setDraftReminders: (reminders: number[]) => void

  setDefaultDraftEvent: () => void
}

const EventDraftContext = createContext({} as EventDraftContextType)

export function useEventDraft() {
  return useContext(EventDraftContext)
}

const getClosestNextHour = () => startOfHour(addHours(new Date(), 1))

export function EventDraftProvider({ children }: { children: ReactNode }) {
  const { calendars } = useCalendarState()
  const [isDrafting, setIsDrafting] = useState(false)

  const defaultCalendarId = calendars[0]?.slug ?? null

  const [text, _setText] = useState("")
  const [draftReminders, setDraftReminders] = useState<number[]>([])

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
    setDraftEvent({ ...draftEvent, summary: newText })
  }

  const setDefaultDraftEvent = () => {
    setDraftEvent(generateDefaultDraftEvent())
    setDraftReminders([])
  }

  const value = {
    isDrafting,
    setIsDrafting,
    text,
    setText,
    draftEvent,
    setDraftEvent,
    draftReminders,
    setDraftReminders,
    setDefaultDraftEvent,
  }

  return <EventDraftContext.Provider value={value}>{children}</EventDraftContext.Provider>
}
