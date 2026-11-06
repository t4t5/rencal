import { View } from "nsh"

import { cn } from "@/lib/utils"

import { isWideWindow, sidebarCollapsed } from "@/stores/view"

import { Agenda } from "./Agenda"
import { Minical } from "./Minical"
import { SidebarHeader } from "./header/SidebarHeader"

export function Sidebar() {
  return (
    <View
      class={cn(
        "flex-col shrink-0 overflow-hidden bg-sidebar",
        isWideWindow() ? "w-[300px] border-r border-border" : "flex-1",
      )}
      style={{ display: isWideWindow() && sidebarCollapsed() ? "none" : "flex" }}
    >
      <SidebarHeader />
      <Minical />
      <Agenda />
    </View>
  )
}
