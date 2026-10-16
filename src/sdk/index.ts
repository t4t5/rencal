// The host surface plugins may import. ESLint bans every other `@/` import under
// src/plugins/**, so anything exported here is a contract plugins depend on.
import { Temporal } from "@js-temporal/polyfill"
import { type MouseEvent, useCallback, useMemo } from "react"

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
import { epochDay, isAllDay } from "@/lib/event-time"

import { type CalendarEvent, toAppEvent, toPluginEvents } from "./events"

export { Temporal } from "@js-temporal/polyfill"
export { type CalendarEvent, type EventDay, eventsByDay } from "./events"
export type { EventAvailability, EventStatus, ResponseStatus } from "@/lib/cal-events"
export type { EventTime, FirstDayOfWeek, TimeFormat } from "@/lib/event-time"
export {
  dateInViewerZone,
  epochDay,
  formatLongDate,
  formatMonth,
  formatShortDate,
  formatTime,
  formatWallclockTime,
  formatWeekday,
  getRelativeDayLabel,
  isAllDay,
  isSameDay,
  startOfWeek,
  toViewerZonedDateTime,
} from "@/lib/event-time"
export { cn } from "@/lib/utils"
export { useToday } from "@/hooks/useToday"
export { useViewerTzid } from "@/hooks/useViewerTzid"
export { Button } from "@/components/ui/button"
export { UntitledEventText } from "@/components/ui/untitled-event-text"
export { ChevronLeftIcon } from "@/icons/chevron-left"
export { ChevronRightIcon } from "@/icons/chevron-right"

/**
 * Events overlapping [start, end), filtered to the visible calendars, in start
 * order. Keeps the range loaded while the caller is mounted.
 */
export function useEventsInRange(
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
): readonly CalendarEvent[] {
  const { calendarEvents } = useCalEvents()
  const { calendars } = useAppCalendars()
  useHoldRange(start, end)
  const first = epochDay(start)
  const last = epochDay(end)

  return useMemo(
    () =>
      toPluginEvents(
        calendarEvents.filter((e) => e.dateInfo.lastDay >= first && e.dateInfo.firstDay < last),
        calendars,
      ),
    [calendarEvents, calendars, first, last],
  )
}

/**
 * The selected date, which renCal's Today button and other navigation move.
 * `goToDate` selects another one.
 */
export function useNavigation() {
  const { activeDate, navigateToDate } = useCalendarNavigation()

  const goToDate = useCallback(
    (date: Temporal.PlainDate) => {
      void navigateToDate(date)
    },
    [navigateToDate],
  )

  return { activeDate, goToDate }
}

export interface Calendar {
  /** Matches `CalendarEvent.calendarId`. */
  readonly id: string
  readonly name: string
  /** A CSS colour for inline styles. Themes can override it, so don't parse it. */
  readonly color: string
  /** In the active calendar group; only visible calendars' events are returned. */
  readonly visible: boolean
}

/** Every calendar, in the user's order. */
export function useCalendars(): readonly Calendar[] {
  const { calendars } = useAppCalendars()
  const visibleIds = useVisibleCalendarIds()

  return useMemo(() => {
    const visible = new Set(visibleIds)
    return calendars.map((calendar) => ({
      id: calendar.slug,
      name: calendar.name || calendar.slug,
      color: getCalendarColor(calendar),
      visible: visible.has(calendar.slug),
    }))
  }, [calendars, visibleIds])
}

/** The user's time format and first day of the week. */
export function useDisplaySettings() {
  const { timeFormat, firstDayOfWeek } = useSettings()
  return { timeFormat, firstDayOfWeek }
}

/** The open event. `toggle` opens the event popover next to `anchor`, or closes it. */
export function useEventSelection() {
  const { activeEvent, toggleActiveEventKey } = useCalEvents()
  const activeKey = activeEvent ? eventKey(activeEvent) : null

  return useMemo(
    () => ({
      isSelected: (event: CalendarEvent) => event.key === activeKey,
      toggle: (event: CalendarEvent, anchor: Element) => {
        setEventAnchor(anchor)
        toggleActiveEventKey(event.key)
      },
    }),
    [activeKey, toggleActiveEventKey],
  )
}

/**
 * Inline style (the source colour themes paint from) and the user's RSVP. Event
 * elements get both from `useEventProps`; this is for marks that aren't events.
 */
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
      rsvp: event.rsvp,
    }
  }, [calendars, event])
}

/**
 * Props to spread on an event element: the calendar-event attributes themes
 * style, its colour, and a click that toggles the event popover next to it.
 */
export function useEventProps(event: CalendarEvent) {
  const { style, rsvp } = useEventAppearance(event)
  const { isSelected, toggle } = useEventSelection()

  return {
    "data-slot": "calendar-event",
    "data-kind": isAllDay(event.start) ? "all-day" : "timed",
    "data-selected": isSelected(event) || undefined,
    "data-rsvp": rsvp ?? undefined,
    // Open popovers let clicks on these through instead of dismissing and swallowing them.
    "data-event-clickable": true,
    style,
    onClick: (e: MouseEvent<Element>) => {
      e.stopPropagation()
      toggle(event, e.currentTarget)
    },
  } as const
}
