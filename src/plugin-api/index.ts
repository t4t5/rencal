// The host surface plugins may import. ESLint bans every other `@/` import under
// src/plugins/**, so anything exported here is a contract plugins depend on.
import { useMemo } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { type CalendarEvent, eventKey } from "@/lib/cal-events"
import { getCalendarColor } from "@/lib/calendar-styles"
import { setEventAnchor } from "@/lib/event-anchor"
import { getCalendarEventStyle } from "@/lib/event-styles"
import { getUserResponseStatus } from "@/lib/event-utils"

export type { CalendarEvent } from "@/lib/cal-events"
export {
  dateInViewerZone,
  formatMonth,
  formatShortDate,
  formatTime,
  isSameDay,
  startOfWeek,
} from "@/lib/event-time"
export { cn } from "@/lib/utils"
export { useToday } from "@/hooks/useToday"
export { UntitledEventText } from "@/components/ui/untitled-event-text"

// Events in the loaded range, filtered to the visible calendars.
export function useEvents(): readonly CalendarEvent[] {
  return useCalEvents().calendarEvents
}

export function useDisplaySettings() {
  const { timeFormat, firstDayOfWeek } = useSettings()
  return { timeFormat, firstDayOfWeek }
}

// The open event. `toggle` opens the event popover next to `anchor`, or closes it.
export function useEventSelection() {
  const { activeEvent, toggleActiveEventKey } = useCalEvents()
  const activeKey = activeEvent ? eventKey(activeEvent) : null

  return {
    isSelected: (event: CalendarEvent) => eventKey(event) === activeKey,
    toggle: (event: CalendarEvent, anchor: HTMLElement) => {
      setEventAnchor(anchor)
      toggleActiveEventKey(eventKey(event))
    },
  }
}

// Inline style (the source colour themes paint from) and the user's RSVP, for
// `data-slot="calendar-event"` elements.
export function useEventAppearance(event: CalendarEvent) {
  const { calendars } = useCalendars()

  return useMemo(() => {
    const calendar = calendars.find((c) => c.slug === event.calendar_slug)
    return {
      style: getCalendarEventStyle({
        calendarColor: getCalendarColor(calendar),
        eventColor: event.color,
      }),
      rsvp: getUserResponseStatus(event, calendars),
    }
  }, [calendars, event])
}
