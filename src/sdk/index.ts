// The host surface plugins may import. ESLint bans every other `@/` import under
// src/views/builtin/**, so anything exported here is a contract plugins depend on.
import { Temporal } from "@js-temporal/polyfill"
import { type MouseEvent, type RefObject, useCallback, useMemo } from "react"

import { useAgendaSelection } from "@/contexts/AgendaFocusContext"
import { useCalEvents, useHoldRange } from "@/contexts/CalEventsContext"
import {
  useCalendars as useAppCalendars,
  useCalendarNavigation,
} from "@/contexts/CalendarStateContext"
import { useEventDragHandle, useEventDragRole } from "@/contexts/EventDragContext"
import { useSettings } from "@/contexts/SettingsContext"

import { useEventsWithDraft } from "@/hooks/cal-events/useEventsWithDraft"
import { useEventsWithDrag } from "@/hooks/cal-events/useEventsWithDrag"
import { useVisibleCalendarIds } from "@/hooks/cal-events/useVisibleCalendarIds"
import { useIsDimmed } from "@/hooks/useIsDimmed"
import { eventKey } from "@/lib/cal-events"
import { getCalendarColor } from "@/lib/calendar-styles"
import { isDraftEvent } from "@/lib/draft-to-event"
import { pointAnchorFromClick, setEventAnchor } from "@/lib/event-anchor"
import { getCalendarEventStyle } from "@/lib/event-styles"
import { epochDay } from "@/lib/event-time"
import { isSpanning } from "@/lib/event-utils"
import { useMenuOpen } from "@/lib/menu-event"

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
  isoWeekNumber,
  isSameDay,
  startOfWeek,
  toViewerZonedDateTime,
} from "@/lib/event-time"
export { cn } from "@/lib/utils"
export { useToday } from "@/hooks/useToday"
export { useViewerTzid } from "@/hooks/useViewerTzid"
export { useIsDimmed } from "@/hooks/useIsDimmed"
export {
  type AllDayBar,
  type DayRange,
  isSpanning,
  layoutAllDay,
  layoutTimed,
  type TimedBlock,
  type TimedRange,
} from "./layout"
export { Button } from "@/components/ui/button"
export { UntitledEventText } from "@/components/ui/untitled-event-text"
export { ChevronLeftIcon } from "@/icons/chevron-left"
export { ChevronRightIcon } from "@/icons/chevron-right"
export { Tooltip } from "./components"
export { type CreateSelection, dayProps, type DayZone, useDayGrid } from "./day-grid"

/**
 * Events overlapping [start, end), filtered to the visible calendars, in start
 * order. Keeps the range loaded while the caller is mounted. Includes the event
 * the user is creating and, while an event is dragged over this view's drop
 * zones, its preview at the drop position (see `useEventState`).
 */
export function useEventsInRange(
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
): readonly CalendarEvent[] {
  const { calendarEvents } = useCalEvents()
  const { calendars } = useAppCalendars()
  const { events: withDraft } = useEventsWithDraft(calendarEvents)
  const events = useEventsWithDrag(withDraft)
  useHoldRange(start, end)
  const first = epochDay(start)
  const last = epochDay(end)

  return useMemo(
    () =>
      toPluginEvents(
        events.filter((e) => e.dateInfo.lastDay >= first && e.dateInfo.firstDay < last),
        calendars,
      ),
    [events, calendars, first, last],
  )
}

/**
 * The selected date, which renCal's Today button and other navigation move.
 * `goToDate` selects another one.
 */
export function useNavigation(): {
  activeDate: Temporal.PlainDate
  goToDate: (date: Temporal.PlainDate) => void
  /** Changes on every deliberate navigation, even to the date already selected: bring it into view. */
  navigationVersion: number
} {
  const { activeDate, navigateToDate, navigationVersion } = useCalendarNavigation()

  const goToDate = useCallback(
    (date: Temporal.PlainDate) => {
      void navigateToDate(date)
    },
    [navigateToDate],
  )

  return { activeDate, goToDate, navigationVersion }
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

/**
 * The user's time format, first day of the week and whether to number weeks
 * (`isoWeekNumber`). `loaded` is false until renCal has read them at startup;
 * until then they are the defaults.
 */
export function useDisplaySettings() {
  const { timeFormat, firstDayOfWeek, showWeekNumbers, settingsLoaded } = useSettings()
  return { timeFormat, firstDayOfWeek, showWeekNumbers, loaded: settingsLoaded }
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

export interface EventState {
  /** Open in the popover, selected in the agenda, or showing its context menu. */
  readonly selected: boolean
  /** The event the user is creating, not saved yet. */
  readonly draft: boolean
  /** `"source"` while this event is dragged, `"preview"` for its copy at the drop position. */
  readonly drag: "source" | "preview" | null
  readonly menuOpen: boolean
}

/**
 * What renCal is doing with an event. `useEventProps` puts all of it on the
 * element as data attributes; this is for rendering that depends on it.
 */
export function useEventState(event: CalendarEvent): EventState {
  const { activeEvent } = useCalEvents()
  const { selectedEventKey } = useAgendaSelection()
  const appEvent = toAppEvent(event)
  const drag = useEventDragRole(appEvent)
  const menuOpen = useMenuOpen(event.key)
  const activeKey = activeEvent ? eventKey(activeEvent) : null

  return {
    selected: event.key === activeKey || event.key === selectedEventKey || menuOpen,
    draft: isDraftEvent(appEvent),
    drag,
    menuOpen,
  }
}

export interface EventPropsOptions {
  /**
   * Lets the user drag the event to reschedule it, onto the drop zones of the
   * view (`dayProps`). The copy under the pointer is a title `"pill"` or
   * the `"block"` itself at its size. Read-only events never drag.
   */
  drag?: "pill" | "block"
  /**
   * Where the popover opens: beside the element, at the click for elements too
   * wide for it to fit beside, like an event spanning a week, or beside the
   * element in a ref, for elements that are gone once clicked, like rows in a
   * tooltip.
   */
  anchor?: "element" | "pointer" | RefObject<Element | null>
}

/**
 * Props to spread on an event element: the calendar-event attributes themes
 * style (including `useEventState` as `data-selected`, `data-draft` and
 * `data-drag-state`, and `data-dimmed` while the user types a new event in the
 * header), its colour, a click that toggles the
 * event popover next to it, renCal's context menu for the event, and with
 * `drag`, a press that drags it. Drafts and drag previews ignore clicks and
 * have no menu.
 */
export function useEventProps(event: CalendarEvent, options: EventPropsOptions = {}) {
  const { style, rsvp } = useEventAppearance(event)
  const state = useEventState(event)
  const { toggleActiveEventKey } = useCalEvents()
  const isStatic = state.draft || state.drag === "preview"
  const dimmed = useIsDimmed() && !isStatic
  const appEvent = toAppEvent(event)
  const { anchor = "element" } = options
  const onPointerDown = useEventDragHandle(appEvent, {
    disabled: isStatic || !options.drag,
    float: options.drag,
  })

  return {
    "data-slot": "calendar-event",
    // Finds the event for the context menu, which the viewport opens.
    "data-event-key": event.key,
    // Drawn as a bar across days, like multi-day timed events, or at its time.
    "data-kind": isSpanning(appEvent) ? "all-day" : "timed",
    "data-selected": state.selected || undefined,
    "data-rsvp": rsvp ?? undefined,
    "data-draft": state.draft || undefined,
    "data-dimmed": dimmed || undefined,
    "data-drag-state": state.drag ?? undefined,
    // Open popovers let clicks on these through instead of dismissing and swallowing them.
    "data-event-clickable": !isStatic || undefined,
    style,
    onPointerDown,
    onClick: isStatic
      ? undefined
      : (e: MouseEvent<Element>) => {
          e.stopPropagation()
          setEventAnchor(
            anchor === "pointer"
              ? pointAnchorFromClick(e)
              : anchor === "element"
                ? e.currentTarget
                : (anchor.current ?? e.currentTarget),
          )
          toggleActiveEventKey(event.key)
        },
  } as const
}
