import { z } from "zod"

import "@/global.css"

import { StatefulCalendar } from "@/components/StatefulCalendar"
import { EditEvent } from "@/components/event-info/EditEvent"
import { PopoverEditEvent } from "@/components/event-info/PopoverEditEvent"
import { PopoverNewEvent } from "@/components/event-info/PopoverNewEvent"
import { SheetEvent } from "@/components/event-info/SheetInfo"
import { EventList } from "@/components/events/EventList"
import { Header } from "@/components/header/Header"
import { MonthView } from "@/components/month-view/MonthView"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { WeekView } from "@/components/week-view/WeekView"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts"
import { useLocalStorage } from "@/hooks/useLocalStorage"

import { HeaderLong } from "./components/header/HeaderLong"
import { useBreakpoint } from "./hooks/useBreakpoint"

const calendarViewSchema = z.enum(["week", "month"])

function App() {
  const { activeEvent } = useCalEvents()
  const [view, setView] = useLocalStorage("calendarView", calendarViewSchema, "month")

  const isMd = useBreakpoint("md")

  useGlobalShortcuts({ setView })

  return (
    <main className="flex h-screen overflow-hidden">
      <div className="absolute h-4 w-full" data-tauri-drag-region />

      <div className="w-full md:w-[300px] flex flex-col shrink-0 md:border-r border-r-divider">
        <Header />
        <StatefulCalendar />
        <EventList />
      </div>

      {isMd && (
        <Tabs
          value={view}
          onValueChange={(v) => setView(v as z.infer<typeof calendarViewSchema>)}
          className="hidden sm:flex flex-col grow"
        >
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
      {isMd && <PopoverNewEvent />}

      {!isMd && <SheetEvent />}
    </main>
  )
}

export default App
