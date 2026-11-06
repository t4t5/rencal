import { effect, Text, View, windowSize } from "nsh"
import { Button as BaseButton } from "nsh/base"

import { RsvpBar } from "@/components/event-parts/inputs/RsvpBar"
import { CommandTooltip } from "@/components/shortcuts/CommandTooltip"
import { Popover } from "@/components/ui/popover"

import { api } from "@/lib/api"
import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { dateInViewerZone, formatShortDate, formatTime } from "@/lib/event-time"

import { calendars } from "@/stores/calendar"
import {
  invitesOpen,
  loadInvites,
  respondToInvite,
  setInvitesOpen,
  upcomingInvites,
} from "@/stores/invites"
import { timeFormat } from "@/stores/settings"

const MD_BREAKPOINT = 768

export function InvitesBadge() {
  const slugs = () => calendars().flatMap((c) => (c.provider === null ? [] : [c.slug]))

  const invites = upcomingInvites

  effect(() => {
    const current = slugs()
    if (current.length === 0) return
    void loadInvites(current)
    // Synced or externally pulled .ics changes fire this; refetch so the badge stays current.
    const changes = api.notifications.listen("events-changed", () => void loadInvites(current))
    return changes.unlisten
  })

  return (
    <If when={invites().length > 0}>
      <Popover
        open={invitesOpen()}
        onOpenChange={(event) => setInvitesOpen(event.open)}
        align={windowSize().width >= MD_BREAKPOINT ? "start" : "end"}
        popupClass="w-80"
        trigger={
          <BaseButton
            accessibilityLabel="Invitations"
            tooltip={<CommandTooltip text="Invitations" action="invites.toggle" />}
            class="size-6 items-center justify-center rounded-full bg-brand hover:bg-brand-hover"
          >
            <Text class="text-xs font-medium text-brand-foreground">{invites().length}</Text>
          </BaseButton>
        }
      >
        <Text class="border-b border-border p-3 text-sm font-medium">Invitations</Text>
        <View class="max-h-80">
          <Each of={invites()} key={(invite) => eventKey(invite)}>
            {(invite) => <InviteCard invite={invite()} />}
          </Each>
        </View>
      </Popover>
    </If>
  )
}

function InviteCard(props: { invite: CalendarEvent }) {
  const organizerEmail = () => props.invite.organizer?.email ?? "Unknown"
  const organizerName = () => props.invite.organizer?.name ?? organizerEmail()
  const when = () => {
    const date = formatShortDate(dateInViewerZone(props.invite.start))
    return props.invite.start.kind === "date"
      ? date
      : `${date} ${formatTime(props.invite.start, timeFormat())}`
  }

  return (
    <View class="border-b border-border">
      <View class="flex-row gap-3 p-3">
        <View class="size-8 shrink-0 items-center justify-center rounded-full bg-muted-foreground">
          <Text class="text-xs font-medium text-background">
            {organizerName().charAt(0).toUpperCase()}
          </Text>
        </View>
        <View class="min-w-0 flex-1 gap-0.5">
          <Text class="truncate text-sm font-medium">{props.invite.summary}</Text>
          <Text class="truncate text-xs text-muted-foreground">From: {organizerEmail()}</Text>
          <Text class="text-xs text-muted-foreground">{when()}</Text>
        </View>
      </View>
      <View class="p-3">
        <RsvpBar onRsvp={(response) => void respondToInvite(props.invite, response)} />
      </View>
    </View>
  )
}
