import { View } from "nsh"

import { inspectable } from "@/lib/inspect"
import { cn } from "@/lib/utils"

import { isWideWindow, sidebarCollapsed } from "@/stores/view"

import { Agenda } from "./Agenda"
import { Minical } from "./Minical"
import { SidebarHeader } from "./header/SidebarHeader"

export function Sidebar() {
  return (
    <View
      class={cn(
        "shrink-0 overflow-hidden",
        !isWideWindow() ? "flex-1" : sidebarCollapsed() ? "w-0" : "w-[300px]",
      )}
    >
      {/* Keeps its width while the frame around it collapses, so it slides out. */}
      <View
        ref={inspectable("Sidebar", "components/sidebar/Sidebar.tsx")}
        class={cn(
          "flex-1 flex-col bg-sidebar",
          isWideWindow() && "w-[300px] self-end border-r border-border",
        )}
      >
        <SidebarHeader />
        <Minical />
        <Agenda />
      </View>
    </View>
  )
}
