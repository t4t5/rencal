import { Temporal } from "@js-temporal/polyfill"
import { useEffect, useState } from "react"

import { RsvpBar } from "@/components/event-parts/inputs/RsvpBar"
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip"

import { rpc } from "@/rpc"
import type { ResponseStatus, TimeFormat } from "@/rpc/bindings"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"
import { useSync } from "@/contexts/SyncContext"

import { useBreakpoint } from "@/hooks/useBreakpoint"
import { useToday } from "@/hooks/useToday"
import { eventKey, rpcToCalendarEvents, type CalendarEvent } from "@/lib/cal-events"
import { dateInViewerZone, formatShortDate, formatTime } from "@/lib/event-time"
import { cn } from "@/lib/utils"

export const INVITES_BUTTON_EL_ID = "global-invites-button"

export function InvitesBadge() {
  const { calendars } = useCalendars()
  const [pendingInvites, setPendingInvites] = useState<CalendarEvent[]>([])
  const today = useToday()

  // Keep today's invitations until local midnight, even after they've ended.
  const invites = pendingInvites.filter(
    (invite) => Temporal.PlainDate.compare(dateInViewerZone(invite.start), today) >= 0,
  )

  useEffect(() => {
    const slugs = calendars.filter((c) => c.provider !== null).map((c) => c.slug)
    if (slugs.length === 0) return

    rpc.caldir
      .list_invites(slugs)
      .then((events) => setPendingInvites(rpcToCalendarEvents(events)))
      .catch(console.error)
  }, [calendars])

  const isMd = useBreakpoint("md")
  const { timeFormat } = useSettings()
  const { requestSync } = useSync()

  if (invites.length === 0) return null

  const handleRsvp = async (invite: CalendarEvent, response: ResponseStatus) => {
    setPendingInvites((prev) => prev.filter((i) => eventKey(i) !== eventKey(invite)))
    try {
      await rpc.caldir.rsvp(invite.calendar_slug, invite.id, response)
      void requestSync()
    } catch (e) {
      console.error("RSVP failed:", e)
    }
  }

  return (
    <Popover>
      <ShortcutTooltip text="Invitations" shortcut="i">
        <PopoverTrigger asChild>
          <button
            id={INVITES_BUTTON_EL_ID}
            aria-label="Invitations"
            className="flex size-6 items-center justify-center rounded-full bg-highlight text-xs font-medium text-white hover:bg-highlight/90 transition-colors outline-none"
          >
            {invites.length}
          </button>
        </PopoverTrigger>
      </ShortcutTooltip>
      <PopoverContent align={isMd ? "start" : "end"} collisionPadding={16} className="w-80 p-0">
        <PopoverArrow />
        <div className="p-3 font-medium text-sm border-b">Invitations</div>
        <div className="max-h-80 overflow-y-auto">
          {invites.map((invite) => (
            <InviteCard
              key={eventKey(invite)}
              invite={invite}
              onRsvp={handleRsvp}
              timeFormat={timeFormat}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function InviteCard({
  invite,
  onRsvp,
  timeFormat,
}: {
  invite: CalendarEvent
  onRsvp: (invite: CalendarEvent, response: ResponseStatus) => void
  timeFormat: TimeFormat
}) {
  const organizerEmail = invite.organizer?.email ?? "Unknown"
  const organizerName = invite.organizer?.name ?? organizerEmail
  const initial = organizerName.charAt(0).toUpperCase()

  const startDate = dateInViewerZone(invite.start)
  const dateStr =
    invite.start.kind === "date"
      ? formatShortDate(startDate)
      : `${formatShortDate(startDate)} ${formatTime(invite.start, timeFormat)}`

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
