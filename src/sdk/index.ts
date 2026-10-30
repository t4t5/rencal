// The host surface plugins may import. ESLint bans every other `@/` import under
// src/plugins/**, so anything exported here is a contract plugins depend on.
import { Temporal } from "@js-temporal/polyfill"
import { type MouseEvent, useCallback, useMemo } from "react"

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
import { useCreateSelectionColor } from "@/hooks/useCreateSelectionColor"
import { useIsDimmed } from "@/hooks/useIsDimmed"
import { type OpenDayDraftOptions, useOpenDayDraft } from "@/hooks/useOpenDayDraft"
import { eventKey } from "@/lib/cal-events"
import { getCalendarColor } from "@/lib/calendar-styles"
import { pointAnchorFromClick, setEventAnchor } from "@/lib/event-anchor"
import type { DropZone } from "@/lib/event-drag"
import { getCalendarEventStyle, getCreateSelectionStyle } from "@/lib/event-styles"
import { epochDay, formatDateKey, isAllDay } from "@/lib/event-time"

import { isDraft, markDraft, useMenuOpen } from "./event-state"
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
export { atTime } from "@/lib/event-time"
export { useToday } from "@/hooks/useToday"
export { useViewerTzid } from "@/hooks/useViewerTzid"
export { useIsDimmed } from "@/hooks/useIsDimmed"
export { useScrollBoundary } from "@/hooks/useScrollBoundary"
export {
  type AllDaySpan,
  assignAllDayLanes,
  clipSpanToRange,
} from "@/hooks/cal-events/all-day-lanes"
export { layoutTimedOverlaps, type TimedBox } from "@/hooks/cal-events/timed-overlaps"
export { ACTIVE_DAY_EL_ID as ACTIVE_DAY_ID } from "@/lib/active-day-draft"
export type { DropZone } from "@/lib/event-drag"
export { Button } from "@/components/ui/button"
export { UntitledEventText } from "@/components/ui/untitled-event-text"
export { ChevronLeftIcon } from "@/icons/chevron-left"
export { ChevronRightIcon } from "@/icons/chevron-right"
export { ContextMenu, EventMenu, type MenuItem, Tooltip } from "./components"
export { type TimedSelection, useTimedDragToCreate } from "./drag-to-create"

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
  const { events: withDraft, draftCalEvent } = useEventsWithDraft(calendarEvents)
  const events = useEventsWithDrag(withDraft)
  useHoldRange(start, end)
  const first = epochDay(start)
  const last = epochDay(end)

  return useMemo(() => {
    if (draftCalEvent) markDraft(draftCalEvent)
    return toPluginEvents(
      events.filter((e) => e.dateInfo.lastDay >= first && e.dateInfo.firstDay < last),
      calendars,
    )
  }, [events, draftCalEvent, calendars, first, last])
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
 * The user's time format and first day of the week. `loaded` is false until
 * renCal has read them at startup; until then they are the defaults.
 */
export function useDisplaySettings() {
  const { timeFormat, firstDayOfWeek, settingsLoaded } = useSettings()
  return { timeFormat, firstDayOfWeek, loaded: settingsLoaded }
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

export interface EventState {
  /** Open in the popover, selected in the agenda, or showing its context menu. */
  readonly selected: boolean
  /** The event the user is creating, not saved yet. */
  readonly draft: boolean
  /** `"source"` while this event is dragged, `"preview"` for its copy at the drop position. */
  readonly drag: "source" | "preview" | null
  readonly menuOpen: boolean
  /** Faded while the user types a new event in the header; never drafts or drag previews. */
  readonly dimmed: boolean
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
  const dimmed = useIsDimmed()
  const draft = isDraft(appEvent)
  const activeKey = activeEvent ? eventKey(activeEvent) : null

  return {
    selected: event.key === activeKey || event.key === selectedEventKey || menuOpen,
    draft,
    drag,
    menuOpen,
    dimmed: dimmed && !draft && drag !== "preview",
  }
}

export interface EventPropsOptions {
  /**
   * Lets the user drag the event to reschedule it, onto the drop zones of the
   * view (`dropZoneProps`). The copy under the pointer is a title `"pill"` or
   * the `"block"` itself at its size. Read-only events never drag.
   */
  drag?: "pill" | "block"
  /**
   * Where the popover opens: beside the element, or at the click for elements
   * too wide for it to fit beside, like an event spanning a week.
   */
  anchor?: "element" | "pointer"
}

/**
 * Props to spread on an event element: the calendar-event attributes themes
 * style (including `useEventState` as `data-selected`, `data-draft`,
 * `data-drag-state` and `data-dimmed`), its colour, a click that toggles the
 * event popover next to it, and with `drag`, a press that drags it. Drafts and
 * drag previews ignore clicks.
 */
export function useEventProps(event: CalendarEvent, options: EventPropsOptions = {}) {
  const { style, rsvp } = useEventAppearance(event)
  const state = useEventState(event)
  const { toggleActiveEventKey } = useCalEvents()
  const isStatic = state.draft || state.drag === "preview"
  const onPointerDown = useEventDragHandle(toAppEvent(event), {
    disabled: isStatic || !options.drag,
    float: options.drag,
  })

  return {
    "data-slot": "calendar-event",
    "data-kind": isAllDay(event.start) ? "all-day" : "timed",
    "data-selected": state.selected || undefined,
    "data-rsvp": rsvp ?? undefined,
    "data-draft": state.draft || undefined,
    "data-dimmed": state.dimmed || undefined,
    "data-drag-state": state.drag ?? undefined,
    // Open popovers let clicks on these through instead of dismissing and swallowing them.
    "data-event-clickable": !isStatic || undefined,
    style,
    onPointerDown,
    onClick: isStatic
      ? undefined
      : (e: MouseEvent<Element>) => {
          e.stopPropagation()
          setEventAnchor(options.anchor === "pointer" ? pointAnchorFromClick(e) : e.currentTarget)
          toggleActiveEventKey(event.key)
        },
  } as const
}

/**
 * Makes an element a place events can be dropped on `date`:
 * - `"day"`: any event moves to the day, keeping its time.
 * - `"all-day"`: all-day and multi-day events only.
 * - `"timed"`: single-day timed events, at the time under the pointer. The
 *   element must span the whole day, 00:00 at its top to 24:00 at its bottom.
 */
export function dropZoneProps(date: Temporal.PlainDate, zone: DropZone) {
  return { "data-drop-day": formatDateKey(date), "data-drop-zone": zone } as const
}

/** Put on a view's scroll container so dragging an event near its edges scrolls it. */
export const dragScrollProps = { "data-drag-scroll": true } as const

/**
 * Opens the new-event popover for `day` next to `anchor`. Timed drafts start at
 * `start`, by default the current hour, and last an hour unless `end` is given.
 * Asks the user to connect an account first when no calendar can take events.
 */
export function useOpenDraft(): (
  day: Temporal.PlainDate,
  anchor: Element,
  options?: OpenDraftOptions,
) => void {
  return useOpenDayDraft()
}

export type OpenDraftOptions = OpenDayDraftOptions

/** Style for a range being drawn to create an event, in the default calendar's colour. */
export function useCreateSelectionStyle() {
  return getCreateSelectionStyle(useCreateSelectionColor())
}
