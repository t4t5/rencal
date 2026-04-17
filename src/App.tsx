import "@/global.css"

import { Aside } from "@/components/Aside"
import { Main } from "@/components/Main"
import { PopoverEditEvent } from "@/components/event-info/PopoverEditEvent"
import { PopoverNewEvent } from "@/components/event-info/PopoverNewEvent"
import { SheetEvent } from "@/components/event-info/SheetInfo"

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
      <div className="absolute h-4 w-full" data-tauri-drag-region />

      <Aside />

      {isMd && <Main calendarView={calendarView} onChangeCalendarView={setCalendarView} />}

      {isMd && <PopoverEditEvent />}
      {isMd && <PopoverNewEvent />}

      {!isMd && <SheetEvent />}
    </main>
  )
}
