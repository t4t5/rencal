import { Header } from "@/components/aside/Header"
import { EventList } from "@/components/aside/events/EventList"
import { Minical } from "@/components/aside/minical/Minical"

export function Aside() {
  return (
    <div className="w-full md:w-[300px] flex flex-col shrink-0 md:border-r border-r-divider">
      <Header />
      <Minical />
      <EventList />
    </div>
  )
}
