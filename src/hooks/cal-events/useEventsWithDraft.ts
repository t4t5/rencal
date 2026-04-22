import { useDeferredValue, useMemo } from "react"

import type { CalendarEvent } from "@/rpc/bindings"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { draftToCalendarEvent } from "@/lib/draft-to-event"

export function useEventsWithDraft(events: CalendarEvent[]) {
  const { isDrafting, draftPopoverOpen, draftEvent } = useEventDraft()
  const { text } = useEventText()

  // Defer the typing-driven values so the layout pipelines downstream
  // (useDayRangeLayout, useMonthEventLayout, useGroupedEvents) don't
  // recompute on every keystroke and block the input commit.
  const deferredText = useDeferredValue(text)
  const deferredDraftEvent = useDeferredValue(draftEvent)

  const draftCalEvent = useMemo(() => {
    if (draftPopoverOpen) return draftToCalendarEvent(deferredDraftEvent)
    if (!isDrafting || !deferredText) return null
    return draftToCalendarEvent(deferredDraftEvent)
  }, [isDrafting, deferredText, draftPopoverOpen, deferredDraftEvent])

  const merged = useMemo(() => {
    if (!draftCalEvent) return events
    return [...events, draftCalEvent]
  }, [events, draftCalEvent])

  return { events: merged, draftCalEvent }
}
