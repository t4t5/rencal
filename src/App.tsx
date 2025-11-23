import "@/global.css"

import { ActionBar } from "@/components/ActionBar"
import { StatefulCalendar } from "@/components/StatefulCalendar"
import { EventList } from "@/components/events/EventList"

function App() {
  return (
    <main className="flex h-screen">
      <div className="w-full md:w-[300px] flex flex-col">
        <ActionBar />
        <StatefulCalendar />
        <EventList />
      </div>

      <div className="hidden md:block">BIG VIEW</div>
    </main>
  )
}

export default App
