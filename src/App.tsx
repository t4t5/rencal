import "@/global.css"

import { StatefulCalendar } from "@/components/StatefulCalendar"
import { EditEvent } from "@/components/event-info/EditEvent"
import { PopoverEditEvent } from "@/components/event-info/PopoverEditEvent"
import { SheetEvent } from "@/components/event-info/SheetInfo"
import { EventList } from "@/components/events/EventList"
import { Header } from "@/components/header/Header"
import { MonthView } from "@/components/month-view/MonthView"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { useBreakpoint } from "./hooks/useBreakpoint"

function App() {
  const { activeEvent } = useCalEvents()

  const isMd = useBreakpoint("md")

  return (
    <main className="flex h-screen">
      <div className="absolute h-4 w-full" data-tauri-drag-region />

      <div className="w-full md:w-[300px] flex flex-col shrink-0">
        <Header />
        <StatefulCalendar />
        <EventList />
      </div>

      {isMd && <MonthView />}

      {!isMd && (
        <div className="hidden md:flex border-l border-l-border w-[350px] shrink-0 flex-col">
          <EditEvent event={activeEvent} />
        </div>
      )}

      {isMd && <PopoverEditEvent />}

      {!isMd && <SheetEvent />}
    </main>
  )
}

export default App
