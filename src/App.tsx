import { useCallback, useState } from "react"

import "@/global.css"

import { ActionBar } from "@/components/ActionBar"
import { ConnectGoogle } from "@/components/ConnectGoogle"
import { EventList } from "@/components/EventList"
import { GoogleCalendars } from "@/components/GoogleCalendars"
import { Calendar } from "@/components/ui/calendar"

import { Calendar as CalendarType } from "@/rpc/bindings"

function App() {
  const [activeDate, setActiveDate] = useState<Date | undefined>(new Date())
  const [calendars, setCalendars] = useState<CalendarType[]>([])

  const handleMonthChange = useCallback((newMonth: Date) => {
    setActiveDate(newMonth)
  }, [])

  const selectedCalendarIds = calendars.filter((c) => c.selected).map((c) => c.id)

  return (
    <main className="flex h-screen">
      <div className="w-full lg:w-[300px] flex flex-col">
        <ActionBar />
        <Calendar
          mode="single"
          selected={activeDate}
          onSelect={setActiveDate}
          month={activeDate}
          onMonthChange={handleMonthChange}
          className="bg-transparent p-0"
          required
        />

        <div className="grow overflow-auto flex-col gap-6">
          <ConnectGoogle />
          <GoogleCalendars calendars={calendars} onCalendarsChange={setCalendars} />
          <EventList activeDate={activeDate ?? new Date()} calendarIds={selectedCalendarIds} />
        </div>
      </div>

      <div className="hidden lg:block">BIG VIEW</div>
    </main>
  )
}

export default App
