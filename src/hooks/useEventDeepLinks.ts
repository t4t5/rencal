import { listen } from "@tauri-apps/api/event"
import { useEffect } from "react"
import { toast } from "sonner"

import { rpc } from "@/rpc"
import { EVENT_DEEP_LINK_AVAILABLE } from "@/rpc/events"

import { useJumpToEvent } from "@/hooks/useJumpToEvent"
import { createEventDeepLinkDrainer } from "@/lib/event-deep-link-drainer"

export function useEventDeepLinks(): void {
  const jumpToEvent = useJumpToEvent()

  useEffect(() => {
    const drain = createEventDeepLinkDrainer({
      takePending: () => rpc.platform.take_pending_event_links(),
      findEvent: (link) => rpc.caldir.find_event(link.uid, link.recurrence_id),
      jumpToEvent,
      onNotFound: () => toast.error("Event not found", { description: "No matching local event." }),
      onError: (error) => {
        console.error("Failed to open event deep link:", error)
        toast.error("Couldn’t open event")
      },
    })

    let disposed = false
    let unlisten: (() => void) | undefined

    void listen(EVENT_DEEP_LINK_AVAILABLE, () => void drain()).then((stopListening) => {
      if (disposed) {
        stopListening()
        return
      }
      unlisten = stopListening
      void drain()
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [jumpToEvent])
}
