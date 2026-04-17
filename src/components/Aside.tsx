import { EventList } from "@/components/events/EventList"
import { Header } from "@/components/header/Header"
import { Minical } from "@/components/minical/Minical"

export function Aside() {
  return (
    <div className="w-full md:w-[300px] flex flex-col shrink-0 md:border-r border-r-divider">
      <Header />
      <Minical />
      <EventList />
    </div>
  )
}
