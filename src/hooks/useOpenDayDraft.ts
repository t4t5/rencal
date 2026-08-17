import { Temporal } from "@js-temporal/polyfill"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"

import { setDraftAnchor, type DraftAnchor } from "@/lib/draft-anchor"
import {
  addDays,
  addMinutes,
  allDayDate,
  atTime,
  DEFAULT_DURATION_MINS,
  getViewerTzid,
  withViewerZone,
  type EventTime,
} from "@/lib/event-time"

export interface OpenDayDraftOptions {
  allDay?: boolean
  /** Start time for a timed draft; defaults to the current hour on `day`. */
  start?: EventTime | null
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

  return (day: Temporal.PlainDate, anchor: DraftAnchor, opts: OpenDayDraftOptions = {}) => {
    if (!canCreate) {
      promptToConnect()
      return
    }

    let start: EventTime
    let end: EventTime
    if (opts.allDay) {
      start = allDayDate(day)
      end = addDays(start, 1)
    } else {
      start = opts.start
        ? withViewerZone(opts.start)
        : atTime(day, Temporal.Now.zonedDateTimeISO(getViewerTzid()).hour)
      end = addMinutes(start, DEFAULT_DURATION_MINS)
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
      conference: null,
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
