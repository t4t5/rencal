import "@/global.css"

import { Main } from "@/components/Main"
import { Aside } from "@/components/aside/Aside"
import { PopoverEditEvent } from "@/components/event-parts/PopoverEditEvent"
import { PopoverNewEvent } from "@/components/event-parts/PopoverNewEvent"
import { SheetEvent } from "@/components/event-parts/SheetInfo"
import { DragRegion } from "@/components/ui/drag-region"

import { CalEventsProvider } from "@/contexts/CalEventsContext"
import { CreateEventGateProvider } from "@/contexts/CreateEventGateContext"
import { EventDraftProvider } from "@/contexts/EventDraftContext"
import { SyncProvider } from "@/contexts/SyncContext"

import { useBreakpoint } from "@/hooks/useBreakpoint"
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts"
import { useLocalStorage } from "@/hooks/useLocalStorage"
import { CalendarView, calendarViewSchema } from "@/lib/calendar-view"
import { Preload } from "@/lib/preload-data"

function GlobalShortcuts({
  onChangeCalendarView,
}: {
  onChangeCalendarView: (calendarView: CalendarView) => void
}) {
  useGlobalShortcuts({ onChangeCalendarView })
  return null
}

export function AppWindow({ preload }: { preload: Preload }) {
  return (
    <CalEventsProvider initialEvents={preload.initialEvents} initialRange={preload.initialRange}>
      <SyncProvider>
        <EventDraftProvider>
          <CreateEventGateProvider>
            <App />
          </CreateEventGateProvider>
        </EventDraftProvider>
      </SyncProvider>
    </CalEventsProvider>
  )
}

function App() {
  const [calendarView, setCalendarView] = useLocalStorage(
    "calendarView",
    calendarViewSchema,
    "month",
  )

  const isMd = useBreakpoint("md")

  return (
    <main className="flex h-screen overflow-hidden">
      <GlobalShortcuts onChangeCalendarView={setCalendarView} />
      <DragRegion className="absolute h-4 w-full" />

      <Aside />

      {isMd && <Main calendarView={calendarView} onChangeCalendarView={setCalendarView} />}

      {isMd && <PopoverEditEvent />}
      {isMd && <PopoverNewEvent />}

      {!isMd && <SheetEvent />}
    </main>
  )
}
