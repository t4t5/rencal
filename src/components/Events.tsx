import { formatDateRange } from "little-date"

interface Event {
  title: string
  from: Date
  to: Date
}

const events: Event[] = [
  {
    title: "Team Sync Meeting",
    from: new Date("2025-06-12T09:00:00"),
    to: new Date("2025-06-12T10:00:00"),
  },
  {
    title: "Design Review",
    from: new Date("2025-06-12T11:30:00"),
    to: new Date("2025-06-12T12:30:00"),
  },
  {
    title: "Client Presentation",
    from: new Date("2025-06-12T14:00:00"),
    to: new Date("2025-06-12T15:00:00"),
  },
]

export function EventList() {
  return (
    <div>
      {events.map((event) => (
        <EventRow key={event.title} event={event} />
      ))}
    </div>
  )
}

function EventRow({ event }: { event: Event }) {
  return (
    <div
      key={event.title}
      className="after:bg-primary/70 relative rounded-md p-2 pl-6 text-sm after:absolute after:inset-y-2 after:left-2 after:w-1 after:rounded-full"
    >
      <div className="font-medium">{event.title}</div>
      <div className="text-muted-foreground text-xs">{formatDateRange(new Date(event.from), new Date(event.to))}</div>
    </div>
  )
}
