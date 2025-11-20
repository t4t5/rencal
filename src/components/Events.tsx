import { formatDateRange } from "little-date"

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

export function Events() {
  return (
    <div>
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
  )
}
