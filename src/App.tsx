import "@/global.css"

import { StatefulCalendar } from "@/components/StatefulCalendar"
import { EventList } from "@/components/events/EventList"
import { Header } from "@/components/header/Header"

function App() {
  return (
    <main className="flex h-screen">
      <div className="w-full md:w-[300px] flex flex-col">
        <Header />
        <StatefulCalendar />
        <EventList />
      </div>

      <div className="hidden md:block">BIG VIEW</div>
    </main>
  )
}

export default App
