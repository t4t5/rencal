import { EventList } from "./event-list/EventList"
import { SidebarHeader } from "./header/SidebarHeader"
import { Minical } from "./minical/Minical"

export function Sidebar() {
  return (
    <div className="w-full md:w-[300px] flex flex-col shrink-0 md:border-r border-r-divider">
      <SidebarHeader />
      <Minical />
      <EventList />
    </div>
  )
}
