import { format, isSameDay } from "date-fns"

import { Event } from "@/rpc/bindings"

export function EventRow({ event }: { event: Event }) {
  const from = new Date(event.start)
  const to = new Date(event.end)

  return (
    <div className="after:bg-primary/70 relative rounded-md p-2 pl-6 text-sm after:absolute after:inset-y-2 after:left-2 after:w-1 after:rounded-full">
      <div className="text-muted-foreground text-xs">
        {event.all_day
          ? "All day"
          : isSameDay(from, to)
            ? `${format(from, "HH:mm")} - ${format(to, "HH:mm")}`
            : `${format(from, "MMM d, HH:mm")} - ${format(to, "MMM d, HH:mm")}`}
      </div>
      <div className="font-medium">{event.summary}</div>
    </div>
  )
}
