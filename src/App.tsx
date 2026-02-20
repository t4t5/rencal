import "@/global.css"

import { StatefulCalendar } from "@/components/StatefulCalendar"
import { EditEvent } from "@/components/event-info/EditEvent"
import { SheetEvent } from "@/components/event-info/SheetInfo"
import { EventList } from "@/components/events/EventList"
import { Header } from "@/components/header/Header"
import { MonthView } from "@/components/month-view/MonthView"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { useBreakpoint } from "./hooks/useBreakpoint"

function App() {
  const { activeEvent } = useCalEvents()

  const isSm = useBreakpoint("sm")
  const isLg = useBreakpoint("lg")

  return (
    <main className="flex h-screen">
      <div className="w-full sm:w-[300px] flex flex-col shrink-0">
        <Header />
        <StatefulCalendar />
        <EventList />
      </div>

      {isLg && <MonthView />}

      <div className="hidden border-l border-l-border w-[350px] shrink-0 sm:flex flex-col">
        <EditEvent event={activeEvent} />
      </div>

      {!isSm && <SheetEvent />}
    </main>
  )
}

export default App
