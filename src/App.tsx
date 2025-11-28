import "@/global.css"

import { StatefulCalendar } from "@/components/StatefulCalendar"
import { EventList } from "@/components/events/EventList"
import { Header } from "@/components/header/Header"

import { SheetEvent } from "./components/event-info/SheetInfo"

function App() {
  return (
    <main className="flex h-screen">
      <div className="w-full md:w-[300px] flex flex-col">
        <Header />
        <StatefulCalendar />
        <EventList />
      </div>

      <div className="hidden md:block">BIG VIEW</div>

      <SheetEvent />
    </main>
  )
}

export default App
