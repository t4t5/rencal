import { ReactNode, createContext, useContext, useState } from "react"

interface EventComposerContextType {
  text: string
  setText: (text: string) => void
  isComposing: boolean
  setIsComposing: (isComposing: boolean) => void
}

const EventComposerContext = createContext({} as EventComposerContextType)

export function useEventComposer() {
  return useContext(EventComposerContext)
}

export function EventComposerProvider({ children }: { children: ReactNode }) {
  const [isComposing, setIsComposing] = useState(false)
  const [text, setText] = useState("")

  const value = { text, setText, isComposing, setIsComposing }

  return <EventComposerContext.Provider value={value}>{children}</EventComposerContext.Provider>
}
