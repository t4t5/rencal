import "@/global.css"

import { Header } from "@/components/Header"
import { StatefulCalendar } from "@/components/StatefulCalendar"
import { EventList } from "@/components/events/EventList"

import { EventComposerProvider } from "./contexts/EventComposerContext"

function App() {
  return (
    <main className="flex h-screen">
      <div className="w-full md:w-[300px] flex flex-col">
        <EventComposerProvider>
          <Header />
        </EventComposerProvider>
        <StatefulCalendar />
        <EventList />
      </div>

      <div className="hidden md:block">BIG VIEW</div>
    </main>
  )
}

export default App
