import { cn } from "@/lib/utils"

import { Agenda } from "./agenda/Agenda"
import { SidebarHeader } from "./header/SidebarHeader"
import { Minical } from "./minical/Minical"

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div
      className={cn(
        "w-full md:w-[300px] flex flex-col shrink-0 md:border-r border-r-divider overflow-hidden",
        collapsed && "md:hidden",
      )}
    >
      <SidebarHeader />
      <Minical />
      <Agenda />
    </div>
  )
}
