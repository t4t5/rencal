import { useDeferredValue, useMemo } from "react"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import type { CalendarEvent } from "@/lib/cal-events"
import { draftToCalendarEvent } from "@/lib/draft-to-event"

export function useEventsWithDraft(events: CalendarEvent[]) {
  const { isDrafting, draftPopoverOpen, draftEvent } = useEventDraft()
  const { text } = useEventText()

  // Two draft sources need different treatment:
  //
  // 1. Header natural-language input (`isDrafting` + `text`): `setDraftEvent`
  //    fires on every keystroke. Defer the whole draft so the layout
  //    pipelines downstream (useDayRangeLayout, useMonthEventLayout,
  //    useGroupedEvents) don't recompute per keystroke and block the input.
  //
  // 2. Popover open (`draftPopoverOpen`): the caller sets `draftEvent` and
  //    flips `draftPopoverOpen` in the same React batch. Deferring the whole
  //    draftEvent renders the draft at the *previous* position (today, from
  //    the prior popover-close reset) for one frame — a visible flash. So we
  //    keep position fields live (start/end/calendarId/recurrence) and only
  //    defer the content fields (summary/description/location). With the
  //    layout memo's deps composed of stable references + deferred content,
  //    keystroke-only edits hit the cached layout during urgent renders and
  //    only invalidate it on the trailing low-priority render.
  const deferredText = useDeferredValue(text)
  const deferredDraftEvent = useDeferredValue(draftEvent)
  const deferredSummary = useDeferredValue(draftEvent.summary)
  const deferredDescription = useDeferredValue(draftEvent.description)
  const deferredLocation = useDeferredValue(draftEvent.location)

  const draftCalEvent = useMemo(() => {
    if (draftPopoverOpen) {
      return draftToCalendarEvent({
        summary: deferredSummary,
        description: deferredDescription,
        location: deferredLocation,
        start: draftEvent.start,
        end: draftEvent.end,
        calendarId: draftEvent.calendarId,
        recurrence: draftEvent.recurrence,
      })
    }
    if (!isDrafting || !deferredText) return null
    return draftToCalendarEvent(deferredDraftEvent)
  }, [
    draftPopoverOpen,
    draftEvent.start,
    draftEvent.end,
    draftEvent.calendarId,
    draftEvent.recurrence,
    deferredSummary,
    deferredDescription,
    deferredLocation,
    isDrafting,
    deferredText,
    deferredDraftEvent,
  ])

  const merged = useMemo(() => {
    if (!draftCalEvent) return events
    return [...events, draftCalEvent]
  }, [events, draftCalEvent])

  return { events: merged, draftCalEvent }
}
