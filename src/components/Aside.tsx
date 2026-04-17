import { StatefulCalendar } from "@/components/StatefulCalendar"
import { EventList } from "@/components/events/EventList"
import { Header } from "@/components/header/Header"

export function Aside() {
  return (
    <div className="w-full md:w-[300px] flex flex-col shrink-0 md:border-r border-r-divider">
      <Header />
      <StatefulCalendar />
      <EventList />
    </div>
  )
}
