import { Button } from "@/components/ui/button"
import { InputGroupAddon } from "@/components/ui/input-group"

import type { ConferenceProvider } from "@/rpc/bindings"

import { conferenceLabel } from "@/lib/conference"

import { GoogleMeetIcon } from "@/icons/google-meet"
import { VideoIcon } from "@/icons/video"

import { RemoveItemButton } from "./RemoveItemButton"

const conferenceIcon: Record<ConferenceProvider, React.ComponentType<{ className?: string }>> = {
  google: GoogleMeetIcon,
  outlook: VideoIcon,
  proton: VideoIcon,
}

export function ConferenceItem({
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

export function ConferenceRequestButton({
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
