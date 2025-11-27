import { addHours, addMinutes, startOfHour } from "date-fns"
import { ReactNode, createContext, useContext, useState } from "react"

import { DraftEvent } from "@/db/types"

interface EventComposerContextType {
  isComposing: boolean
  setIsComposing: (isComposing: boolean) => void

  text: string
  setText: (text: string) => void

  draftEvent: DraftEvent
  setDraftEvent: (event: DraftEvent) => void
}

const EventComposerContext = createContext({} as EventComposerContextType)

export function useEventComposer() {
  return useContext(EventComposerContext)
}

const getClosestNextHour = () => startOfHour(addHours(new Date(), 1))

export function EventComposerProvider({ children }: { children: ReactNode }) {
  const [isComposing, setIsComposing] = useState(false)

  const [text, _setText] = useState("")

  const [draftEvent, setDraftEvent] = useState<DraftEvent>({
    summary: "",
    allDay: false,
    start: getClosestNextHour(),
    end: addMinutes(getClosestNextHour(), 30),
  })

  const setText = (newText: string) => {
    _setText(newText)
    setDraftEvent({ ...draftEvent, summary: newText })
  }

  const value = {
    isComposing,
    setIsComposing,
    text,
    setText,
    draftEvent,
    setDraftEvent,
  }

  return <EventComposerContext.Provider value={value}>{children}</EventComposerContext.Provider>
}
