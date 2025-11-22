import { Event } from "@/rpc/bindings"

import { EventRow } from "./EventRow"

export function DaySection({ events }: { events: Event[] }) {
  return (
    <div className="relative">
      <div className="bg-red-600 sticky top-0 z-10">Test 1</div>
      {events.slice(0, 15).map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </div>
  )
}
