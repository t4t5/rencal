import { ReactNode, createContext, useContext, useMemo, useState } from "react"

interface AgendaSelectionContextType {
  selectedEventKey: string | null
  setSelectedEventKey: (key: string | null) => void
}

const AgendaSelectionContext = createContext({} as AgendaSelectionContextType)

export function useAgendaSelection() {
  return useContext(AgendaSelectionContext)
}

export function AgendaFocusProvider({ children }: { children: ReactNode }) {
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null)
  const value = useMemo(() => ({ selectedEventKey, setSelectedEventKey }), [selectedEventKey])

  return <AgendaSelectionContext.Provider value={value}>{children}</AgendaSelectionContext.Provider>
}
