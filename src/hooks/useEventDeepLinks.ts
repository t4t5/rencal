import { useEffect } from "react"
import { toast } from "sonner"

import { rpc } from "@/rpc"

import { useJumpToEvent } from "@/hooks/useJumpToEvent"
import { getErrorMessage } from "@/lib/api/errors"
import { listenAppEvent } from "@/lib/api/events"
import { rpcToCalendarEvent, type CalendarEvent } from "@/lib/cal-events"

export function useEventDeepLinks(): void {
  const jumpToEvent = useJumpToEvent()

  useEffect(() => {
    const showError = (error: unknown) => {
      console.error("Failed to open event deep link:", error)
      toast.error("Couldn’t open event", {
        description: getErrorMessage(error, "Failed to load the linked event"),
      })
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
    const subscription = listenAppEvent("event-deep-link-available", drain)
    void subscription.ready.then(() => {
      if (!disposed) void drain()
    })

    return () => {
      disposed = true
      subscription.unlisten()
    }
  }, [jumpToEvent])
}
