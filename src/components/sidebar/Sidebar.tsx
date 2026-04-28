import { Agenda } from "./agenda/Agenda"
import { SidebarHeader } from "./header/SidebarHeader"
import { Minical } from "./minical/Minical"

export function Sidebar() {
  return (
    <div className="w-full md:w-[300px] flex flex-col shrink-0 md:border-r border-r-divider overflow-hidden">
      <SidebarHeader />
      <Minical />
      <Agenda />
    </div>
  )
}
