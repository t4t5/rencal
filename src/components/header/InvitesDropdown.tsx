import { format, parseISO } from "date-fns"
import { useEffect, useState } from "react"
import { GoBell as BellIcon } from "react-icons/go"

import { Button } from "@/components/ui/button"
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { rpc } from "@/rpc"
import type { CalendarEvent } from "@/rpc/bindings"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { useBreakpoint } from "@/hooks/useBreakpoint"
import { cn } from "@/lib/utils"

export function InvitesDropdown() {
  const { calendars } = useCalendarState()
  const [invites, setInvites] = useState<CalendarEvent[]>([])

  useEffect(() => {
    const slugs = calendars.filter((c) => c.provider !== null).map((c) => c.slug)
    if (slugs.length === 0) return

    rpc.caldir.list_invites(slugs).then(setInvites).catch(console.error)
  }, [calendars])

  const isMd = useBreakpoint("md")

  if (invites.length === 0) return null

  const handleRsvp = async (invite: CalendarEvent, response: string) => {
    setInvites((prev) => prev.filter((i) => i.id !== invite.id))
    try {
      await rpc.caldir.rsvp(invite.calendar_slug, invite.id, response)
    } catch (e) {
      console.error("RSVP failed:", e)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" className="relative">
          <BellIcon />
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
            {invites.length}
          </span>
        </Button>
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
  onRsvp: (invite: CalendarEvent, response: string) => void
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

      <div className="flex gap-1.5 p-3 pt-0 justify-between">
        <Button size="sm" variant="secondary" onClick={() => onRsvp(invite, "tentative")}>
          Maybe
        </Button>

        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => onRsvp(invite, "declined")}>
            Decline
          </Button>
          <Button size="sm" variant="default" onClick={() => onRsvp(invite, "accepted")}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  )
}
