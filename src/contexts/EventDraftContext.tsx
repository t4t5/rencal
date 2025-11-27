import { addHours, addMinutes, startOfHour } from "date-fns"
import { ReactNode, createContext, useContext, useState } from "react"

import { DraftEvent } from "@/db/types"

interface EventDraftContextType {
  isDrafting: boolean
  setIsDrafting: (isDrafting: boolean) => void

  text: string
  setText: (text: string) => void

  draftEvent: DraftEvent
  setDraftEvent: (event: DraftEvent) => void

  setDefaultDraftEvent: () => void
}

const EventDraftContext = createContext({} as EventDraftContextType)

export function useEventDraft() {
  return useContext(EventDraftContext)
}

const getClosestNextHour = () => startOfHour(addHours(new Date(), 1))

export function EventDraftProvider({ children }: { children: ReactNode }) {
  const [isDrafting, setIsDrafting] = useState(false)

  const [text, _setText] = useState("")

  const generateDefaultDraftEvent = (): DraftEvent => {
    return {
      summary: "",
      allDay: false,
      start: getClosestNextHour(),
      end: addMinutes(getClosestNextHour(), 30),
    }
  }

  const [draftEvent, setDraftEvent] = useState<DraftEvent>(generateDefaultDraftEvent())

  const setText = (newText: string) => {
    _setText(newText)
    setDraftEvent({ ...draftEvent, summary: newText })
  }

  const value = {
    isDrafting,
    setIsDrafting,
    text,
    setText,
    draftEvent,
    setDraftEvent,
    setDefaultDraftEvent: () => setDraftEvent(generateDefaultDraftEvent()),
  }

  return <EventDraftContext.Provider value={value}>{children}</EventDraftContext.Provider>
}
