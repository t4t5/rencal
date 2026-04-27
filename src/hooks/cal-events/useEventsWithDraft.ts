import { useDeferredValue, useMemo } from "react"

import type { CalendarEvent } from "@/rpc/bindings"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { draftToCalendarEvent } from "@/lib/draft-to-event"

export function useEventsWithDraft(events: CalendarEvent[]) {
  const { isDrafting, draftPopoverOpen, draftEvent } = useEventDraft()
  const { text } = useEventText()

  // Two draft sources need different treatment:
  //
  // 1. Header natural-language input (`isDrafting` + `text`): `setDraftEvent`
  //    fires on every keystroke. Defer so the layout pipelines downstream
  //    (useDayRangeLayout, useMonthEventLayout, useGroupedEvents) don't
  //    recompute per keystroke and block the input commit.
  //
  // 2. Popover open (`draftPopoverOpen`): the caller sets `draftEvent` and
  //    flips `draftPopoverOpen` in the same React batch. `useDeferredValue`
  //    lags one render, so deferring here would render the draft at the
  //    *previous* draftEvent position (today, from the prior popover-close
  //    reset) for one frame — a visible flash before snapping to the
  //    clicked day. Use the fresh value directly.
  const deferredText = useDeferredValue(text)
  const deferredDraftEvent = useDeferredValue(draftEvent)

  const draftCalEvent = useMemo(() => {
    if (draftPopoverOpen) return draftToCalendarEvent(draftEvent)
    if (!isDrafting || !deferredText) return null
    return draftToCalendarEvent(deferredDraftEvent)
  }, [isDrafting, deferredText, draftPopoverOpen, draftEvent, deferredDraftEvent])

  const merged = useMemo(() => {
    if (!draftCalEvent) return events
    return [...events, draftCalEvent]
  }, [events, draftCalEvent])

  return { events: merged, draftCalEvent }
}
