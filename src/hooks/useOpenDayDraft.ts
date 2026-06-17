import { addHours, setHours, startOfDay } from "date-fns"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"

import { setDraftAnchor, type DraftAnchor } from "@/lib/draft-anchor"
import {
  addDays,
  allDayFromLocalDate,
  fromDate,
  getLocalTzid,
  type EventTime,
} from "@/lib/event-time"

export interface OpenDayDraftOptions {
  allDay?: boolean
  startHour?: number
  /** Anchor the popover at this viewport Y instead of the element's center. */
  clickY?: number
}

/**
 * Opens the compose-event draft popover for a given day, anchored to `anchor`.
 * Shared by the month/week context menus and the "add event on active day" shortcut.
 */
export function useOpenDayDraft() {
  const { setActiveEventKey } = useCalEvents()
  const { setDraftEvent, setDraftPopoverOpen, setIsDrafting, defaultCalendarId } = useEventDraft()
  const { canCreate, promptToConnect } = useCreateEventGate()

  return (day: Date, anchor: DraftAnchor, opts: OpenDayDraftOptions = {}) => {
    if (!canCreate) {
      promptToConnect()
      return
    }

    const tzid = getLocalTzid()
    let start: EventTime
    let end: EventTime
    if (opts.allDay) {
      start = allDayFromLocalDate(day)
      end = addDays(start, 1)
    } else {
      const startJs = setHours(startOfDay(day), opts.startHour ?? 0)
      start = fromDate(startJs, tzid)
      end = fromDate(addHours(startJs, 1), tzid)
    }

    setActiveEventKey(null)
    setIsDrafting(false)
    setDraftEvent({
      summary: "",
      description: null,
      start,
      end,
      calendarId: defaultCalendarId,
      location: null,
      recurrence: null,
      attendees: [],
    })

    if (opts.clickY != null) {
      const { left, width } = anchor.getBoundingClientRect()
      const y = opts.clickY
      setDraftAnchor({ getBoundingClientRect: () => new DOMRect(left, y, width, 0) })
    } else {
      setDraftAnchor(anchor)
    }
    setDraftPopoverOpen(true)
  }
}
