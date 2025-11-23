import "@/global.css"

import { ActionBar } from "@/components/ActionBar"
import { StatefulCalendar } from "@/components/StatefulCalendar"
import { EventList } from "@/components/events/EventList"

function App() {
  return (
    <main className="flex h-screen">
      <div className="w-full lg:w-[300px] flex flex-col">
        <ActionBar />
        <StatefulCalendar />

        <div className="grow overflow-auto flex-col gap-6">
          <EventList />
        </div>
      </div>

      <div className="hidden lg:block">BIG VIEW</div>
    </main>
  )
}

export default App
