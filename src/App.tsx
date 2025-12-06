import "@/global.css"

import { StatefulCalendar } from "@/components/StatefulCalendar"
import { EditEvent } from "@/components/event-info/EditEvent"
import { SheetEvent } from "@/components/event-info/SheetInfo"
import { EventList } from "@/components/events/EventList"
import { Header } from "@/components/header/Header"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { useBreakpoint } from "./hooks/useBreakpoint"

function App() {
  const { activeEvent } = useCalEvents()

  const isSm = useBreakpoint("sm")

  return (
    <main className="flex h-screen">
      <div className="w-full sm:w-[300px] flex flex-col">
        <Header />
        <StatefulCalendar />
        <EventList />
      </div>

      <div className="hidden border-l border-l-border grow sm:flex flex-col">
        <EditEvent event={activeEvent} />
      </div>

      {!isSm && <SheetEvent />}
    </main>
  )
}

export default App
