import { openUrl } from "@tauri-apps/plugin-opener"

import { Button } from "@/components/ui/button"

import type { EventConference } from "@/rpc/bindings"

import { conferenceJoinLabel } from "@/lib/conference"

import { VideoIcon } from "@/icons/video"

export function ConferenceLink({
  conference,
}: {
  conference: Extract<EventConference, { status: "live" }>
}) {
  return (
    <div className="flex flex-col gap-1 px-3 py-1">
      <Button className="w-full" onClick={() => openUrl(conference.url)}>
        <VideoIcon />
        {conferenceJoinLabel[conference.provider]}
      </Button>
      <span className="text-xs text-muted-foreground truncate px-1">{conference.url}</span>
    </div>
  )
}
