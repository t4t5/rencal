import { openUrl } from "@tauri-apps/plugin-opener"

import { Button } from "@/components/ui/button"

import { VideoIcon } from "@/icons/video"

function getLabel(url: string): string {
  try {
    const host = new URL(url).hostname
    if (host.includes("meet.google.com")) return "Join Google Meet"
  } catch {
    // ignore
  }
  return "Join Meeting"
}

export function ConferenceLink({ url }: { url: string }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-1">
      <Button className="w-full" onClick={() => openUrl(url)}>
        <VideoIcon />
        {getLabel(url)}
      </Button>
      <span className="text-xs text-muted-foreground truncate px-1">{url}</span>
    </div>
  )
}
