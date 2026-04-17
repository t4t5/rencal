import "@/global.css"

import { Main } from "@/components/Main"
import { Aside } from "@/components/aside/Aside"
import { PopoverEditEvent } from "@/components/event-info/PopoverEditEvent"
import { PopoverNewEvent } from "@/components/event-info/PopoverNewEvent"
import { SheetEvent } from "@/components/event-info/SheetInfo"
import { DragRegion } from "@/components/ui/drag-region"

import { useBreakpoint } from "@/hooks/useBreakpoint"
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts"
import { useLocalStorage } from "@/hooks/useLocalStorage"
import { CalendarView, calendarViewSchema } from "@/lib/calendar-view"

function GlobalShortcuts({
  onChangeCalendarView,
}: {
  onChangeCalendarView: (calendarView: CalendarView) => void
}) {
  useGlobalShortcuts({ onChangeCalendarView })
  return null
}

export default function App() {
  const [calendarView, setCalendarView] = useLocalStorage(
    "calendarView",
    calendarViewSchema,
    "month",
  )

  const isMd = useBreakpoint("md")

  return (
    <main className="flex h-screen overflow-hidden">
      <GlobalShortcuts onChangeCalendarView={setCalendarView} />
      <DragRegion className="absolute h-4 w-full" />

      <Aside />

      {isMd && <Main calendarView={calendarView} onChangeCalendarView={setCalendarView} />}

      {isMd && <PopoverEditEvent />}
      {isMd && <PopoverNewEvent />}

      {!isMd && <SheetEvent />}
    </main>
  )
}
