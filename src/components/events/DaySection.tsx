import { format } from "date-fns"
import { forwardRef } from "react"

import { Event } from "@/rpc/bindings"

import { EventRow } from "./EventRow"

type DaySectionProps = {
  date: Date
  events: Event[]
  "data-date"?: string
}

export const DaySection = forwardRef<HTMLDivElement, DaySectionProps>(
  ({ date, events, "data-date": dataDate }, ref) => {
    return (
      <div ref={ref} data-date={dataDate} className="relative border-b border-b-divider">
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
