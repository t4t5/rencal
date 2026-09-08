import type { ReactNode } from "react"
import { Toaster } from "sonner"

import { MassDeleteConfirmDialog } from "@/components/sync/MassDeleteConfirmDialog"
import { UpdateChecker } from "@/components/update/UpdateChecker"

import { AgendaFocusProvider } from "@/contexts/AgendaFocusContext"
import { CalEventsProvider } from "@/contexts/CalEventsContext"
import { CreateEventGateProvider } from "@/contexts/CreateEventGateContext"
import { EventDraftProvider } from "@/contexts/EventDraftContext"
import { EventDragProvider } from "@/contexts/EventDragContext"
import { RecurrenceEditProvider } from "@/contexts/RecurrenceEditContext"
import { SyncProvider } from "@/contexts/SyncContext"

import type { Preload } from "@/lib/preload-data"

interface AppProvidersProps {
  preload: Preload
  children: ReactNode
}

export function AppProviders({ preload, children }: AppProvidersProps) {
  // Order matters: each provider may only read from the ones above it.
  //   CalEvents       <- CalendarState, Settings (mounted in main.tsx)
  //   Sync            <- CalEvents, CalendarState, Settings
  //   RecurrenceEdit  <- CalEvents, Sync
  //   EventDrag       <- CalEvents, CalendarState, RecurrenceEdit
  //   EventDraft      <- CalEvents, CalendarState, Settings, Sync
  //   CreateEventGate <- CalendarState
  //   AgendaFocus has no provider dependencies.
  return (
    <CalEventsProvider initialEvents={preload.initialEvents} initialRange={preload.initialRange}>
      <SyncProvider>
        <RecurrenceEditProvider>
          <EventDragProvider>
            <EventDraftProvider>
              <CreateEventGateProvider>
                <AgendaFocusProvider>{children}</AgendaFocusProvider>
              </CreateEventGateProvider>
            </EventDraftProvider>
          </EventDragProvider>
        </RecurrenceEditProvider>
        <MassDeleteConfirmDialog />
        <UpdateChecker />
        <Toaster richColors position="bottom-right" />
      </SyncProvider>
    </CalEventsProvider>
  )
}
