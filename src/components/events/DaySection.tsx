import { format, isSameYear } from "date-fns"
import { forwardRef } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { cn } from "@/lib/utils"

import type { CalendarEvent } from "@/db/types"

import { EventRow } from "./EventRow"

type DaySectionProps = {
  date: Date
  events: CalendarEvent[]
}

export const DaySection = forwardRef<HTMLDivElement, DaySectionProps>(({ date, events }, ref) => {
  const { activeEvent, setActiveEventId } = useCalEvents()

  return (
    <div
      ref={ref}
      data-date={format(date, "yyyy-MM-dd")}
      className="relative border-b border-b-divider"
    >
      <div className="sticky top-0 z-10 font-bold text-sm bg-bgPrimary uppercase px-3 py-1.5">
        {format(date, isSameYear(date, new Date()) ? "dd MMM" : "dd MMM yyyy")}
      </div>

      <div className="flex flex-col gap-1 pb-2">
        {events.map((event) => {
          const isActive = event.id === activeEvent?.id

          return (
            <div
              key={event.id}
              onClick={() => setActiveEventId(event.id)}
              className={cn("cursor-default hover:bg-secondary py-1", {
                "bg-accent!": isActive,
              })}
            >
              <EventRow event={event} />
            </div>
          )
        })}
      </div>
    </div>
  )
})
