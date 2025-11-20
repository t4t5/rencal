"use client"

import { formatDateRange } from "little-date"
import { PlusIcon } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"

const events = [
  {
    title: "Team Sync Meeting",
    from: "2025-06-12T09:00:00",
    to: "2025-06-12T10:00:00",
  },
  {
    title: "Design Review",
    from: "2025-06-12T11:30:00",
    to: "2025-06-12T12:30:00",
  },
  {
    title: "Client Presentation",
    from: "2025-06-12T14:00:00",
    to: "2025-06-12T15:00:00",
  },
]

export default function CalendarCard() {
  const [activeDate, setActiveDate] = React.useState<Date | undefined>(new Date())

  const handleMonthChange = React.useCallback((newMonth: Date) => {
    // When navigating months, update activeDate to the first day of the new month
    setActiveDate(newMonth)
  }, [])

  return (
    <div className="w-full py-4 h-auto!">
      <Calendar
        mode="single"
        selected={activeDate}
        onSelect={setActiveDate}
        month={activeDate}
        onMonthChange={handleMonthChange}
        className="bg-transparent p-0"
        required
      />
      <div className="flex flex-col items-start gap-3 border-t px-4 pt-4!">
        <div className="flex w-full items-center justify-between px-1">
          <div className="text-sm font-medium">
            {activeDate?.toLocaleDateString("en-US", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
          <Button variant="ghost" size="icon" className="size-6" title="Add Event">
            <PlusIcon />
            <span className="sr-only">Add Event</span>
          </Button>
        </div>
        <div className="flex w-full flex-col gap-2">
          {events.map((event) => (
            <div
              key={event.title}
              className="after:bg-primary/70 relative rounded-md p-2 pl-6 text-sm after:absolute after:inset-y-2 after:left-2 after:w-1 after:rounded-full"
            >
              <div className="font-medium">{event.title}</div>
              <div className="text-muted-foreground text-xs">{formatDateRange(new Date(event.from), new Date(event.to))}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
