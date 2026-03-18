import "@/global.css"

import { StatefulCalendar } from "@/components/StatefulCalendar"
import { EditEvent } from "@/components/event-info/EditEvent"
import { PopoverEditEvent } from "@/components/event-info/PopoverEditEvent"
import { SheetEvent } from "@/components/event-info/SheetInfo"
import { EventList } from "@/components/events/EventList"
import { Header } from "@/components/header/Header"
import { MonthView } from "@/components/month-view/MonthView"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { WeekView } from "@/components/week-view/WeekView"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { HeaderLong } from "./components/header/HeaderLong"
import { useBreakpoint } from "./hooks/useBreakpoint"

function App() {
  const { activeEvent } = useCalEvents()

  const isMd = useBreakpoint("md")

  return (
    <main className="flex h-screen overflow-hidden">
      <div className="absolute h-4 w-full" data-tauri-drag-region />

      <div className="w-full md:w-[300px] flex flex-col shrink-0">
        <Header />
        <StatefulCalendar />
        <EventList />
      </div>

      {isMd && (
        <Tabs defaultValue="month" className="hidden sm:flex flex-col grow">
          <HeaderLong />
          <div className="h-[calc(100vh-80px)]">
            <TabsContent value="week" className="h-full">
              <WeekView />
            </TabsContent>
            <TabsContent value="month" className="h-full">
              <MonthView />
            </TabsContent>
          </div>
        </Tabs>
      )}

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
