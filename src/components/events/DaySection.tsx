import { format } from "date-fns"
import { forwardRef } from "react"

import { Event } from "@/rpc/bindings"

import { EventRow } from "./EventRow"

export const DaySection = forwardRef<HTMLDivElement, { date: Date; events: Event[] }>(
  ({ date, events }, ref) => {
    return (
      <div ref={ref} className="relative border-b border-b-divider">
        <div className="sticky top-0 z-10 font-bold text-sm bg-bgPrimary uppercase px-4 py-1.5">
          {format(date, "dd MMM")}
        </div>
        {events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>
    )
  },
)
