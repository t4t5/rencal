import { openUrl } from "@tauri-apps/plugin-opener"

import { Button } from "@/components/ui/button"
import { InputGroupAddon } from "@/components/ui/input-group"

import type { Calendar } from "@/rpc/bindings"

import {
  calendarConferenceProvider,
  conferenceLabel,
  type ConferenceProvider,
  type EventConference,
} from "@/lib/conference"

import { GoogleMeetIcon } from "@/icons/google-meet"
import { VideoIcon } from "@/icons/video"

import { RemoveItemButton } from "./RemoveItemButton"

const conferenceIcon: Record<ConferenceProvider, React.ComponentType<{ className?: string }>> = {
  google: GoogleMeetIcon,
  outlook: VideoIcon,
  proton: VideoIcon,
}

export function ConferenceDisplay({
  conference,
  calendar,
  readonly,
  onConferenceChange,
}: {
  conference?: EventConference | null
  calendar?: Calendar
  readonly?: boolean
  onConferenceChange?: (conference: EventConference | null) => void
}) {
  if (conference?.status === "live") {
    return <ConferenceLink conference={conference} />
  }

  if (conference?.status === "requested") {
    return (
      <ConferenceItem
        provider={conference.provider}
        readonly={readonly}
        onRemove={onConferenceChange ? () => onConferenceChange(null) : undefined}
      />
    )
  }

  const conferenceProvider = calendarConferenceProvider(calendar)

  if (conferenceProvider && !readonly && onConferenceChange) {
    return (
      <ConferenceRequestButton
        provider={conferenceProvider}
        onClick={() => onConferenceChange({ status: "requested", provider: conferenceProvider })}
      />
    )
  }

  return null
}

function ConferenceLink({
  conference,
}: {
  conference: Extract<EventConference, { status: "live" }>
}) {
  return (
    <div className="flex flex-col gap-1 px-3 py-1">
      <Button className="w-full" onClick={() => openUrl(conference.url)}>
        <VideoIcon />
        Join {conferenceLabel[conference.provider]}
      </Button>
      <span className="text-xs text-muted-foreground truncate px-1">{conference.url}</span>
    </div>
  )
}

function ConferenceItem({
  provider,
  readonly,
  onRemove,
}: {
  provider: ConferenceProvider
  readonly?: boolean
  onRemove?: () => void
}) {
  const Icon = conferenceIcon[provider]

  return (
    <div className="group flex h-control-height items-center justify-between rounded-md p-2 pr-3 pl-0 text-sm hover:bg-secondary focus-within:bg-secondary">
      <div className="flex min-w-0 items-center gap-2">
        <InputGroupAddon>
          <Icon />
        </InputGroupAddon>
        <span>{conferenceLabel[provider]}</span>
      </div>

      {!readonly && onRemove && <RemoveItemButton onClick={onRemove} />}
    </div>
  )
}

function ConferenceRequestButton({
  provider,
  onClick,
}: {
  provider: ConferenceProvider
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="w-full justify-start px-0 text-muted-foreground bodytext!"
      onClick={onClick}
    >
      <InputGroupAddon>
        <VideoIcon />
      </InputGroupAddon>
      Add {conferenceLabel[provider]}
    </Button>
  )
}
