import { format, isSameYear } from "date-fns"
import { forwardRef } from "react"

import { CalendarEvent } from "@/storage/db"

import { EventRow } from "./EventRow"

type DaySectionProps = {
  date: Date
  events: CalendarEvent[]
}

export const DaySection = forwardRef<HTMLDivElement, DaySectionProps>(({ date, events }, ref) => {
  return (
    <div
      ref={ref}
      data-date={format(date, "yyyy-MM-dd")}
      className="relative border-b border-b-divider"
    >
      <div className="sticky top-0 z-10 font-bold text-sm bg-bgPrimary uppercase px-3 py-1.5">
        {format(date, isSameYear(date, new Date()) ? "dd MMM" : "dd MMM yyyy")}
      </div>

      <div className="flex flex-col gap-3 pb-2">
        {events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  )
})
