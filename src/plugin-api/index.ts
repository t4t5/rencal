// The host surface plugins may import. ESLint bans every other `@/` import under
// src/plugins/**, so anything exported here is a contract plugins depend on.
import { Temporal } from "@js-temporal/polyfill"
import { useMemo } from "react"

import { useCalEvents, useHoldRange } from "@/contexts/CalEventsContext"
import {
  useCalendars as useAppCalendars,
  useCalendarNavigation,
} from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { useVisibleCalendarIds } from "@/hooks/cal-events/useVisibleCalendarIds"
import { eventKey } from "@/lib/cal-events"
import { getCalendarColor } from "@/lib/calendar-styles"
import { setEventAnchor } from "@/lib/event-anchor"
import { getCalendarEventStyle } from "@/lib/event-styles"
import { epochDay } from "@/lib/event-time"
import { getUserResponseStatus } from "@/lib/event-utils"

import { useViewHost } from "@/views/ViewHostContext"

import { type CalendarEvent, toAppEvent, toPluginEvents } from "./events"

export type { CalendarEvent } from "./events"
export type { EventTime } from "@/lib/event-time"
export {
  dateInViewerZone,
  epochDay,
  formatMonth,
  formatShortDate,
  formatTime,
  isAllDay,
  isSameDay,
  startOfWeek,
  toViewerZonedDateTime,
} from "@/lib/event-time"
export { cn } from "@/lib/utils"
export { useToday } from "@/hooks/useToday"
export { Button } from "@/components/ui/button"
export { UntitledEventText } from "@/components/ui/untitled-event-text"
export { ChevronLeftIcon } from "@/icons/chevron-left"
export { ChevronRightIcon } from "@/icons/chevron-right"

// Events overlapping [start, end), filtered to the visible calendars, in start
// order. Keeps the range loaded while the caller is mounted.
export function useEventsInRange(
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
): readonly CalendarEvent[] {
  const { calendarEvents } = useCalEvents()
  useHoldRange(start, end)
  const first = epochDay(start)
  const last = epochDay(end)

  return useMemo(
    () =>
      toPluginEvents(
        calendarEvents.filter((e) => e.dateInfo.lastDay >= first && e.dateInfo.firstDay < last),
      ),
    [calendarEvents, first, last],
  )
}

// The selected date. `goToDate` selects another one; `openView` switches to the
// view with that id, showing `date`.
export function useNavigation() {
  const { activeDate, setActiveDate, navigateToDate } = useCalendarNavigation()
  const { showView } = useViewHost()

  const actions = useMemo(
    () => ({
      goToDate: (date: Temporal.PlainDate) => {
        void navigateToDate(date)
      },
      openView: (viewId: string, date: Temporal.PlainDate) => {
        // Select the date first so the new view mounts there instead of scrolling to it.
        setActiveDate(date)
        showView(viewId)
        void navigateToDate(date)
      },
    }),
    [setActiveDate, navigateToDate, showView],
  )

  return { activeDate, ...actions }
}

export interface Calendar {
  /** Matches `CalendarEvent.calendarId`. */
  readonly id: string
  readonly name: string
  /** In the active calendar group; only visible calendars' events are returned. */
  readonly visible: boolean
}

// Every calendar, in the user's order.
export function useCalendars(): readonly Calendar[] {
  const { calendars } = useAppCalendars()
  const visibleIds = useVisibleCalendarIds()

  return useMemo(() => {
    const visible = new Set(visibleIds)
    return calendars.map((calendar) => ({
      id: calendar.slug,
      name: calendar.name || calendar.slug,
      visible: visible.has(calendar.slug),
    }))
  }, [calendars, visibleIds])
}

export function useDisplaySettings() {
  const { timeFormat, firstDayOfWeek } = useSettings()
  return { timeFormat, firstDayOfWeek }
}

// The open event. `toggle` opens the event popover next to `anchor`, or closes it.
export function useEventSelection() {
  const { activeEvent, toggleActiveEventKey } = useCalEvents()
  const activeKey = activeEvent ? eventKey(activeEvent) : null

  return useMemo(
    () => ({
      isSelected: (event: CalendarEvent) => event.key === activeKey,
      toggle: (event: CalendarEvent, anchor: HTMLElement) => {
        setEventAnchor(anchor)
        toggleActiveEventKey(event.key)
      },
    }),
    [activeKey, toggleActiveEventKey],
  )
}

// Inline style (the source colour themes paint from) and the user's RSVP, for
// `data-slot="calendar-event"` elements.
export function useEventAppearance(event: CalendarEvent) {
  const { calendars } = useAppCalendars()

  return useMemo(() => {
    const appEvent = toAppEvent(event)
    const calendar = calendars.find((c) => c.slug === appEvent.calendar_slug)
    return {
      style: getCalendarEventStyle({
        calendarColor: getCalendarColor(calendar),
        eventColor: appEvent.color,
      }),
      rsvp: getUserResponseStatus(appEvent, calendars),
    }
  }, [calendars, event])
}
