import { Button } from "@/components/ui/button"
import { InputGroupAddon } from "@/components/ui/input-group"

import { GoogleMeetIcon } from "@/icons/google-meet"
import { VideoIcon } from "@/icons/video"

import { RemoveItemButton } from "./RemoveItemButton"

export function GoogleMeetItem({
  readonly,
  onRemove,
}: {
  readonly?: boolean
  onRemove?: () => void
}) {
  return (
    <div className="group flex h-control-height items-center justify-between rounded-md p-2 pr-3 pl-0 text-sm hover:bg-secondary focus-within:bg-secondary">
      <div className="flex min-w-0 items-center gap-2">
        <InputGroupAddon>
          <GoogleMeetIcon />
        </InputGroupAddon>
        <span>Google Meet</span>
      </div>

      {!readonly && onRemove && <RemoveItemButton onClick={onRemove} />}
    </div>
  )
}

export function GoogleMeetRequestButton({ onClick }: { onClick: () => void }) {
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
      Add Google Meet
    </Button>
  )
}
