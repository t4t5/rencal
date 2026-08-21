import { listen } from "@tauri-apps/api/event"
import { useEffect } from "react"
import { toast } from "sonner"

import { rpc } from "@/rpc"
import { EVENT_DEEP_LINK_AVAILABLE } from "@/rpc/events"

import { useJumpToEvent } from "@/hooks/useJumpToEvent"
import { rpcToCalendarEvent, type CalendarEvent } from "@/lib/cal-events"

export function useEventDeepLinks(): void {
  const jumpToEvent = useJumpToEvent()

  useEffect(() => {
    const showError = (error: unknown) => {
      console.error("Failed to open event deep link:", error)
      toast.error("Couldn’t open event")
    }

    const drain = async () => {
      let eventToOpen: CalendarEvent | undefined

      try {
        const links = await rpc.platform.take_pending_event_links()
        for (const link of links) {
          try {
            const event = await rpc.caldir.find_event(link.uid, link.recurrence_id)
            if (event) {
              eventToOpen = rpcToCalendarEvent(event)
            } else {
              toast.error("Event not found", { description: "No matching local event." })
            }
          } catch (error) {
            showError(error)
          }
        }

        if (eventToOpen) await jumpToEvent(eventToOpen)
      } catch (error) {
        showError(error)
      }
    }

    let disposed = false
    let unlisten: (() => void) | undefined

    void listen(EVENT_DEEP_LINK_AVAILABLE, drain).then((stopListening) => {
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
