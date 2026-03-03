import { AiOutlineUser as UserIcon } from "react-icons/ai"

import { InputGroup, InputGroupAddon } from "@/components/ui/input-group"

import { EventAttendee } from "@/rpc/bindings"

import { cn } from "@/lib/utils"

const statusColor: Record<string, string> = {
  accepted: "bg-green-500",
  declined: "bg-red-500",
  tentative: "bg-yellow-500",
}

function AttendeeRow({ attendee, label }: { attendee: EventAttendee; label?: string }) {
  const displayName = attendee.name ?? attendee.email
  const initial = displayName.charAt(0).toUpperCase()
  const color = statusColor[attendee.response_status ?? ""] ?? "bg-muted-foreground"

  return (
    <div className="flex items-center gap-2 py-1 px-3 pl-9 text-sm">
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white",
          color,
        )}
      >
        {initial}
      </span>
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

      {organizer && <AttendeeRow attendee={organizer} label="Organiser" />}
      {attendees?.map((a) => (
        <AttendeeRow key={a.email} attendee={a} />
      ))}
    </div>
  )
}
