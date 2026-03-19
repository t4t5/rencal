import { useMemo } from "react"

import type { CalendarEvent } from "@/rpc/bindings"

import { useEventDraft } from "@/contexts/EventDraftContext"

import { draftToCalendarEvent } from "@/lib/draft-to-event"

export function useEventsWithDraft(events: CalendarEvent[]) {
  const { isDrafting, text, draftEvent } = useEventDraft()

  const draftCalEvent = useMemo(() => {
    if (!isDrafting || !text) return null
    return draftToCalendarEvent(draftEvent)
  }, [isDrafting, text, draftEvent])

  const merged = useMemo(() => {
    if (!draftCalEvent) return events
    return [...events, draftCalEvent]
  }, [events, draftCalEvent])

  return { events: merged, draftCalEvent }
}
