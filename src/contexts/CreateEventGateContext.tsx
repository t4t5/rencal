import { ReactNode, createContext, useContext, useMemo, useState } from "react"

import { AddAccountModal } from "@/components/settings/accounts/AddAccountModal"

import { useCalendars } from "./CalendarStateContext"

interface CreateEventGateContextType {
  canCreate: boolean
  promptToConnect: () => void
}

const CreateEventGateContext = createContext({} as CreateEventGateContextType)

export function useCreateEventGate() {
  return useContext(CreateEventGateContext)
}

export function CreateEventGateProvider({ children }: { children: ReactNode }) {
  const { calendars } = useCalendars()
  const [modalOpen, setModalOpen] = useState(false)

  const canCreate = calendars.some((c) => !c.read_only)

  const value = useMemo<CreateEventGateContextType>(
    () => ({
      canCreate,
      promptToConnect: () => setModalOpen(true),
    }),
    [canCreate],
  )

  return (
    <CreateEventGateContext.Provider value={value}>
      {children}
      {modalOpen && <AddAccountModal onClose={() => setModalOpen(false)} />}
    </CreateEventGateContext.Provider>
  )
}
