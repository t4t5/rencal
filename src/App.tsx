import { useCallback, useState } from "react"

import "@/global.css"

import { ActionBar } from "@/components/ActionBar"
import { EventList } from "@/components/EventList"
import { Calendar } from "@/components/ui/calendar"

function App() {
  const [activeDate, setActiveDate] = useState<Date | undefined>(new Date())

  const handleMonthChange = useCallback((newMonth: Date) => {
    setActiveDate(newMonth)
  }, [])

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
          <EventList activeDate={activeDate ?? new Date()} />
        </div>
      </div>

      <div className="hidden lg:block">BIG VIEW</div>
    </main>
  )
}

export default App
