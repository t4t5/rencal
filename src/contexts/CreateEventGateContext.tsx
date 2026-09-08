import { ReactNode, useMemo, useState } from "react"

import { AddAccountModal } from "@/components/settings/accounts/AddAccountModal"

import { createStrictContext } from "@/lib/strict-context"

import { useCalendars } from "./CalendarStateContext"

interface CreateEventGateContextType {
  canCreate: boolean
  promptToConnect: () => void
}

const [CreateEventGateContextProvider, useCreateEventGate] =
  createStrictContext<CreateEventGateContextType>("CreateEventGate")

export { useCreateEventGate }

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
    <CreateEventGateContextProvider value={value}>
      {children}
      {modalOpen && <AddAccountModal onClose={() => setModalOpen(false)} />}
    </CreateEventGateContextProvider>
  )
}
