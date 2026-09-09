import { useCalendars } from "@/contexts/CalendarStateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"

import { getCalendarColor } from "@/lib/calendar-styles"

export function useCreateSelectionColor(): string | null {
  const { calendars } = useCalendars()
  const { defaultCalendarId } = useEventDraft()
  return getCalendarColor(calendars.find((calendar) => calendar.slug === defaultCalendarId))
}
