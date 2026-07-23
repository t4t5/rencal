import { Toaster } from "sonner"

import { PopoverEditEvent } from "@/components/event-parts/PopoverEditEvent"
import { PopoverNewEvent } from "@/components/event-parts/PopoverNewEvent"
import { SheetEvent } from "@/components/event-parts/SheetInfo"
import { Main } from "@/components/main/Main"
import { GlobalShortcuts } from "@/components/shortcuts/GlobalShortcuts"
import { Sidebar } from "@/components/sidebar/Sidebar"
import { MassDeleteConfirmDialog } from "@/components/sync/MassDeleteConfirmDialog"
import { DragRegion } from "@/components/ui/drag-region"
import { UpdateChecker } from "@/components/update/UpdateChecker"

import { AgendaFocusProvider } from "@/contexts/AgendaFocusContext"
import { CalEventsProvider } from "@/contexts/CalEventsContext"
import { CreateEventGateProvider } from "@/contexts/CreateEventGateContext"
import { EventDraftProvider } from "@/contexts/EventDraftContext"
import { RecurrenceEditProvider } from "@/contexts/RecurrenceEditContext"
import { SyncProvider } from "@/contexts/SyncContext"

import { useBreakpoint } from "@/hooks/useBreakpoint"
import { useCalendarView } from "@/hooks/useCalendarView"
import { Preload } from "@/lib/preload-data"

export function AppWindow({ preload }: { preload: Preload }) {
  return (
    <CalEventsProvider initialEvents={preload.initialEvents} initialRange={preload.initialRange}>
      <SyncProvider>
        <RecurrenceEditProvider>
          <EventDraftProvider>
            <CreateEventGateProvider>
              <AgendaFocusProvider>
                <App />
              </AgendaFocusProvider>
            </CreateEventGateProvider>
          </EventDraftProvider>
        </RecurrenceEditProvider>
        <MassDeleteConfirmDialog />
        <UpdateChecker />
        <Toaster richColors position="bottom-right" />
      </SyncProvider>
    </CalEventsProvider>
  )
}

function App() {
  const { calendarView, setCalendarView } = useCalendarView()

  const isMd = useBreakpoint("md")

  return (
    <main className="flex h-screen overflow-clip">
      <GlobalShortcuts onChangeCalendarView={setCalendarView} />
      <DragRegion className="absolute h-4! w-full" />

      <Sidebar />

      {isMd && <Main calendarView={calendarView} onChangeCalendarView={setCalendarView} />}

      {isMd && <PopoverEditEvent />}
      {isMd && <PopoverNewEvent />}

      {!isMd && <SheetEvent />}
    </main>
  )
}
