import { EventDragOverlay } from "@/components/event-parts/EventDragOverlay"
import { PopoverEditEvent } from "@/components/event-parts/PopoverEditEvent"
import { PopoverNewEvent } from "@/components/event-parts/PopoverNewEvent"
import { SheetEvent } from "@/components/event-parts/SheetInfo"
import { Main } from "@/components/main/Main"
import { GlobalShortcuts } from "@/components/shortcuts/GlobalShortcuts"
import { Sidebar } from "@/components/sidebar/Sidebar"
import { DragRegion } from "@/components/ui/drag-region"

import { useBreakpoint } from "@/hooks/useBreakpoint"
import { useCalendarView } from "@/hooks/useCalendarView"
import { useSidebarCollapse } from "@/hooks/useSidebarCollapse"
import type { Preload } from "@/lib/preload-data"

import { AppProviders } from "./AppProviders"

export function AppWindow({ preload }: { preload: Preload }) {
  return (
    <AppProviders preload={preload}>
      <App />
    </AppProviders>
  )
}

function App() {
  const { calendarView, setCalendarView } = useCalendarView()
  const { collapsed, toggleCollapsed } = useSidebarCollapse()

  const isMd = useBreakpoint("md")

  return (
    <main className="flex h-screen overflow-clip">
      <GlobalShortcuts onChangeCalendarView={setCalendarView} onToggleSidebar={toggleCollapsed} />
      <DragRegion className="absolute h-4! w-full" />

      <Sidebar collapsed={collapsed} />

      {isMd && <Main calendarView={calendarView} onChangeCalendarView={setCalendarView} />}

      {isMd && <PopoverEditEvent />}
      {isMd && <PopoverNewEvent />}
      {isMd && <EventDragOverlay />}

      {!isMd && <SheetEvent />}
    </main>
  )
}
