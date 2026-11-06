// `rencal://event/...` links, queued by the backend until they're taken here.
import { api, getErrorMessage } from "@/lib/api"
import { takePendingEventLinks } from "@/lib/api/internal"
import type { CalendarEvent } from "@/lib/cal-events"
import { logger } from "@/lib/logger"
import { toast } from "@/lib/toast"

import { jumpToEvent } from "@/stores/agenda"

function showError(error: unknown) {
  logger.error("Failed to open event deep link:", error)
  toast.error("Couldn’t open event", {
    description: getErrorMessage(error, "Failed to load the linked event"),
  })
}

async function drain() {
  let eventToOpen: CalendarEvent | undefined
  for (const link of await takePendingEventLinks()) {
    try {
      const event = await api.events.findByUid(link.uid, link.recurrence_id)
      if (event) eventToOpen = event
      else toast.error("Event not found", { description: "No matching local event." })
    } catch (error) {
      showError(error)
    }
  }
  if (eventToOpen) await jumpToEvent(eventToOpen)
}

export function startDeepLinks() {
  const drainSafely = () => void drain().catch(showError)
  api.notifications.listen("event-deep-link-available", drainSafely)
  drainSafely()
}
