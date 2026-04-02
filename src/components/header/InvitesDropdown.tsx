import { format, parseISO } from "date-fns"
import { useEffect, useState } from "react"

import { RsvpBar } from "@/components/event-info/inputs/RsvpBar"
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { rpc } from "@/rpc"
import type { CalendarEvent, ResponseStatus } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"

import { useBreakpoint } from "@/hooks/useBreakpoint"
import { cn } from "@/lib/utils"

export function InvitesDropdown() {
  const { calendars } = useCalendars()
  const { reloadEvents } = useCalEvents()
  const [invites, setInvites] = useState<CalendarEvent[]>([])

  useEffect(() => {
    const slugs = calendars.filter((c) => c.provider !== null).map((c) => c.slug)
    if (slugs.length === 0) return

    rpc.caldir.list_invites(slugs).then(setInvites).catch(console.error)
  }, [calendars])

  const isMd = useBreakpoint("md")

  if (invites.length === 0) return null

  const handleRsvp = async (invite: CalendarEvent, response: ResponseStatus) => {
    setInvites((prev) => prev.filter((i) => i.id !== invite.id))
    try {
      await rpc.caldir.rsvp(invite.calendar_slug, invite.id, response)
      await rpc.caldir.sync([invite.calendar_slug])
      await reloadEvents()
    } catch (e) {
      console.error("RSVP failed:", e)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex size-7 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white cursor-pointer hover:bg-red-600 transition-colors">
          {invites.length}
        </button>
      </PopoverTrigger>
      <PopoverContent align={isMd ? "start" : "end"} collisionPadding={16} className="w-80 p-0">
        <PopoverArrow />
        <div className="p-3 font-medium text-sm border-b">Invitations</div>
        <div className="max-h-80 overflow-y-auto">
          {invites.map((invite) => (
            <InviteCard key={invite.id} invite={invite} onRsvp={handleRsvp} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function InviteCard({
  invite,
  onRsvp,
}: {
  invite: CalendarEvent
  onRsvp: (invite: CalendarEvent, response: ResponseStatus) => void
}) {
  const organizerEmail = invite.organizer?.email ?? "Unknown"
  const organizerName = invite.organizer?.name ?? organizerEmail
  const initial = organizerName.charAt(0).toUpperCase()

  const dateStr = invite.all_day
    ? format(parseISO(invite.start), "EEE, d MMM")
    : format(parseISO(invite.start), "EEE, d MMM HH:mm")

  return (
    <div className="flex flex-col border-b last:border-b-0">
      <div className="flex gap-3 p-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white bg-muted-foreground",
          )}
        >
          {initial}
        </span>
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-sm truncate">{invite.summary}</span>
            <span className="text-xs text-muted-foreground truncate">From: {organizerEmail}</span>
            <span className="text-xs text-muted-foreground">{dateStr}</span>
          </div>
        </div>
      </div>

      <div className="pt-0">
        <RsvpBar onRsvp={(response) => onRsvp(invite, response)} />
      </div>
    </div>
  )
}
