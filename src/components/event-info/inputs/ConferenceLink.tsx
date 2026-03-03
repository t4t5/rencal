import { openUrl } from "@tauri-apps/plugin-opener"
import { LuVideo } from "react-icons/lu"

import { Button } from "@/components/ui/button"

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
        <LuVideo />
        {getLabel(url)}
      </Button>
      <span className="text-xs text-muted-foreground truncate px-1">{url}</span>
    </div>
  )
}
