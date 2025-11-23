import { format } from "date-fns"

import { Event } from "@/rpc/bindings"

import { EventRow } from "./EventRow"

export function DaySection({ date, events }: { date: Date; events: Event[] }) {
  return (
    <div className="relative border-b border-b-divider">
      <div className="sticky top-0 z-10 font-bold text-sm bg-bgPrimary uppercase px-4 py-1.5">
        {format(date, "dd MMM")}
      </div>
      {events.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </div>
  )
}
