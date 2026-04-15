import { InputGroup, InputGroupAddon } from "@/components/ui/input-group"
import { StatusDot } from "@/components/ui/status-dot"

import { EventAttendee } from "@/rpc/bindings"

import { UserIcon } from "@/icons/user"

function AttendeeRow({ attendee, label }: { attendee: EventAttendee; label?: string }) {
  const displayName = attendee.name ?? attendee.email

  return (
    <div className="flex items-center gap-2 py-1 px-3 pl-9 text-sm">
      <StatusDot status={attendee.response_status} />
      <span className="truncate">{displayName}</span>
      {label && <span className="text-muted-foreground shrink-0">{label}</span>}
    </div>
  )
}

export function AttendeesDisplay({
  organizer,
  attendees,
}: {
  organizer?: EventAttendee | null
  attendees?: EventAttendee[]
}) {
  const hasAttendees = attendees && attendees.length > 0
  if (!hasAttendees) return null

  return (
    <div className="flex flex-col">
      <InputGroup className="pointer-events-none">
        <InputGroupAddon>
          <UserIcon />
        </InputGroupAddon>
        <span className="flex items-center py-2 pl-2 text-sm text-muted-foreground">Attendees</span>
      </InputGroup>

      {organizer && (
        <AttendeeRow
          attendee={attendees?.find((a) => a.email === organizer.email) ?? organizer}
          label="Organiser"
        />
      )}
      {attendees
        ?.filter((a) => a.email !== organizer?.email)
        .map((a) => (
          <AttendeeRow key={a.email} attendee={a} />
        ))}
    </div>
  )
}
