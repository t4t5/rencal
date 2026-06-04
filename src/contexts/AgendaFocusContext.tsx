import { ReactNode, createContext, useContext, useMemo, useState } from "react"

import { eventKeyFromAgendaItemId } from "@/lib/agenda-item"

// Two contexts on purpose: `isFocused` flips only when the agenda gains/loses
// keyboard focus (rare), while `selectedItemId` changes on every Tab / Shift+Tab
// press. Keeping them separate stops consumers that only care about focus from
// re-rendering on each selection move.

interface AgendaFocusedContextType {
  isFocused: boolean
  setIsFocused: (value: boolean) => void
}

interface AgendaSelectionContextType {
  // Identity of the keyboard-selected agenda item: `${dateKey}::${eventKey}`.
  // Composite because a multi-day event renders in several day sections, so the
  // eventKey alone wouldn't pick out a single row.
  selectedItemId: string | null
  setSelectedItemId: (id: string | null) => void
  // The selected item's `eventKey`, for highlighting the event across the rest
  // of the app (month/week views), where rows are keyed by event, not by day.
  selectedEventKey: string | null
}

const AgendaFocusedContext = createContext({} as AgendaFocusedContextType)
const AgendaSelectionContext = createContext({} as AgendaSelectionContextType)

export function useAgendaFocused() {
  return useContext(AgendaFocusedContext)
}

export function useAgendaSelection() {
  return useContext(AgendaSelectionContext)
}

export function AgendaFocusProvider({ children }: { children: ReactNode }) {
  const [isFocused, setIsFocused] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  const focusedValue = useMemo(() => ({ isFocused, setIsFocused }), [isFocused])

  const selectedEventKey = useMemo(
    () => (selectedItemId ? eventKeyFromAgendaItemId(selectedItemId) : null),
    [selectedItemId],
  )
  const selectionValue = useMemo(
    () => ({ selectedItemId, setSelectedItemId, selectedEventKey }),
    [selectedItemId, selectedEventKey],
  )

  return (
    <AgendaFocusedContext.Provider value={focusedValue}>
      <AgendaSelectionContext.Provider value={selectionValue}>
        {children}
      </AgendaSelectionContext.Provider>
    </AgendaFocusedContext.Provider>
  )
}
