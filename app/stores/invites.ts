// Invitations waiting for an answer, and whether their popover is open.
import { Temporal } from "@js-temporal/polyfill"
import { signal, untracked } from "nsh"

import { api } from "@/lib/api"
import { eventKey, type CalendarEvent, type ResponseStatus } from "@/lib/cal-events"
import { CommandError } from "@/lib/commands"
import { dateInViewerZone } from "@/lib/event-time"

import { currentDay } from "@/stores/clock"
import { requestSync } from "@/stores/sync"

const pendingInvites = signal<CalendarEvent[]>([])
const popoverOpen = signal(false)

export const invitesOpen = () => popoverOpen()
export const setInvitesOpen = (open: boolean) => popoverOpen.set(open)

export async function loadInvites(slugs: string[]) {
  try {
    pendingInvites.set(await api.events.listInvites({ calendar_slugs: slugs }))
  } catch (error) {
    console.error(error)
  }
}

export async function respondToInvite(invite: CalendarEvent, response: ResponseStatus) {
  pendingInvites.update((list) => list.filter((i) => eventKey(i) !== eventKey(invite)))
  try {
    await api.events.rsvp(invite, response)
    void requestSync()
  } catch (error) {
    console.error("RSVP failed:", error)
  }
}

/** Keeps today's invitations until local midnight, even after they've ended. */
export const upcomingInvites = () =>
  pendingInvites().filter(
    (invite) => Temporal.PlainDate.compare(dateInViewerZone(invite.start), currentDay()) >= 0,
  )

/** `invites.toggle`: there's nothing to open without invitations. */
export function toggleInvites() {
  if (untracked(upcomingInvites).length === 0) throw new CommandError("There are no invitations")
  popoverOpen.update((open) => !open)
}
