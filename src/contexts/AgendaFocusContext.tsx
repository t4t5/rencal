import { ReactNode, useMemo, useState } from "react"

import { createStrictContext } from "@/lib/strict-context"

interface AgendaSelectionContextType {
  selectedEventKey: string | null
  setSelectedEventKey: (key: string | null) => void
}

const [AgendaSelectionContextProvider, useAgendaSelection] =
  createStrictContext<AgendaSelectionContextType>("AgendaFocus")

export { useAgendaSelection }

export function AgendaFocusProvider({ children }: { children: ReactNode }) {
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null)
  const value = useMemo(() => ({ selectedEventKey, setSelectedEventKey }), [selectedEventKey])

  return <AgendaSelectionContextProvider value={value}>{children}</AgendaSelectionContextProvider>
}
