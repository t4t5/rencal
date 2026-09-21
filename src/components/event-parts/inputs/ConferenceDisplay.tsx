import { openUrl } from "@tauri-apps/plugin-opener"

import { Button } from "@/components/ui/button"
import {
  ControlContent,
  ControlLeading,
  ControlRow,
  ControlTrailing,
} from "@/components/ui/control-row"

import type { Calendar } from "@/lib/api"
import {
  calendarConferenceProvider,
  conferenceLabel,
  detectConference,
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
  location,
  calendar,
  readonly,
  onConferenceChange,
}: {
  conference?: EventConference | null
  location?: string | null
  calendar?: Calendar
  readonly?: boolean
  onConferenceChange?: (conference: EventConference | null) => void
}) {
  if (conference?.status === "live") {
    const label = conferenceLabel[conference.provider]

    return <ConferenceLink url={conference.url} label={label} />
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

  // Conference links detected in event's "Location" field:
  const detected = detectConference(location)

  if (detected) {
    return <ConferenceLink url={detected.url} label={detected.label} />
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

function ConferenceLink({ url, label }: { url: string; label: string }) {
  return (
    <div className="flex flex-col gap-1 py-1">
      <Button className="w-full cursor-pointer" onClick={() => openUrl(url)}>
        <VideoIcon />
        Join {label}
      </Button>
      <span className="text-xs text-muted-foreground truncate">{url}</span>
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
    <ControlRow className="group h-control rounded-md border border-transparent text-sm hover:bg-secondary focus-within:bg-secondary">
      <ControlLeading>
        <Icon />
      </ControlLeading>
      <ControlContent className="truncate">{conferenceLabel[provider]}</ControlContent>
      {!readonly && onRemove && (
        <ControlTrailing>
          <RemoveItemButton onClick={onRemove} />
        </ControlTrailing>
      )}
    </ControlRow>
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
    <ControlRow asChild>
      <Button
        type="button"
        variant="ghost"
        typography="field"
        className="w-full justify-start gap-[var(--control-content-gap)] px-[var(--control-padding-inline)] text-muted-foreground"
        onClick={onClick}
      >
        <ControlLeading>
          <VideoIcon />
        </ControlLeading>
        <ControlContent className="text-left">Add {conferenceLabel[provider]}</ControlContent>
      </Button>
    </ControlRow>
  )
}
