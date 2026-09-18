import { useEffect } from "react"
import { toast } from "sonner"

import { useJumpToEvent } from "@/hooks/useJumpToEvent"
import { findEvent } from "@/lib/api/calendar-events"
import { getErrorMessage } from "@/lib/api/errors"
import { listenAppEvent } from "@/lib/api/events"
import { takePendingEventLinks } from "@/lib/api/platform"
import type { CalendarEvent } from "@/lib/cal-events"

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
        const links = await takePendingEventLinks()
        for (const link of links) {
          try {
            const event = await findEvent(link.uid, link.recurrence_id)
            if (event) {
              eventToOpen = event
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
