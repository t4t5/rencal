import "@/global.css"

import { Main } from "@/components/Main"
import { PopoverEditEvent } from "@/components/event-parts/PopoverEditEvent"
import { PopoverNewEvent } from "@/components/event-parts/PopoverNewEvent"
import { SheetEvent } from "@/components/event-parts/SheetInfo"
import { Sidebar } from "@/components/sidebar/Sidebar"
import { MassDeleteConfirmDialog } from "@/components/sync/MassDeleteConfirmDialog"
import { DragRegion } from "@/components/ui/drag-region"

import { CalEventsProvider } from "@/contexts/CalEventsContext"
import { CreateEventGateProvider } from "@/contexts/CreateEventGateContext"
import { EventDraftProvider } from "@/contexts/EventDraftContext"
import { SyncProvider } from "@/contexts/SyncContext"

import { useBreakpoint } from "@/hooks/useBreakpoint"
import { useCalendarView } from "@/hooks/useCalendarView"
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts"
import { CalendarView } from "@/lib/calendar-view"
import { Preload } from "@/lib/preload-data"

export function AppWindow({ preload }: { preload: Preload }) {
  return (
    <CalEventsProvider initialEvents={preload.initialEvents} initialRange={preload.initialRange}>
      <SyncProvider>
        <EventDraftProvider>
          <CreateEventGateProvider>
            <App />
          </CreateEventGateProvider>
        </EventDraftProvider>
        <MassDeleteConfirmDialog />
      </SyncProvider>
    </CalEventsProvider>
  )
}

function App() {
  const { calendarView, setCalendarView } = useCalendarView()

  const isMd = useBreakpoint("md")

  return (
    <main className="flex h-screen overflow-hidden">
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

// Isolated so context updates in useGlobalShortcuts don't re-render <App />
function GlobalShortcuts({
  onChangeCalendarView,
}: {
  onChangeCalendarView: (calendarView: CalendarView) => void
}) {
  useGlobalShortcuts({ onChangeCalendarView })
  return null
}
