/*
 * The SDK of renCal's view plugins, on NSH: what a plugin imports as
 * `@rencomputer/rencal-sdk`. It runs in the plugin's own engine, so all it
 * knows of renCal is what `protocol.ts` carries; renCal's own `lib/` provides
 * Temporal, formatting and layout, so plugins draw days as renCal does.
 *
 * State is accessors (`activeDate()`, `events()`), read in JSX or closures as
 * any NSH signal. Start the plugin with `mountView(View)`.
 */
import { Temporal } from "@js-temporal/polyfill"
import { computed, effect, host, mount, signal, type JSX, type ViewRef } from "nsh"

import { provideCalendarPrefs } from "@/lib/calendar-prefs"
import { type EventTime, epochDay, getViewerTzid, setViewerTzid } from "@/lib/event-time"

import { applyTheme } from "@/themes"

import type {
  PluginRequest,
  WireCalendar,
  WireContext,
  WireEvent,
  WireEventTime,
  WireEvents,
  WireNavigate,
  WirePaint,
  WireTheme,
} from "./protocol"

export { Temporal }
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
export {
  listTimeZones,
  timeZoneAbbreviation,
  timeZoneCity,
  timeZoneOffsetLabel,
} from "@/lib/event-time/timezones"
export {
  type AllDayBar,
  type DayRange,
  layoutAllDay,
  layoutTimed,
  type TimedBlock,
  type TimedRange,
} from "@/lib/layout"
export type { WirePaint as EventPaint } from "./protocol"

// renCal's own kit, so plugins look and behave like the rest of the app.
export { Button } from "@/components/ui/button"
export { DatePicker } from "@/components/ui/date-picker"
export { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu"
export { Popover } from "@/components/ui/popover"
export { Select } from "@/components/ui/select"
export { Tooltip } from "@/components/ui/tooltip"
export { TimeZoneLabel, TimeZonePicker } from "@/components/event-parts/inputs/TimeZonePicker"
export {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  GlobeIcon,
  MoreHorizIcon,
  PlusIcon,
} from "@/icons"
export { cn } from "@/lib/utils"
export { typography } from "@/themes"

/** An event as plugins see it: a curated subset of renCal's, so its refactors don't break them. */
export interface CalendarEvent {
  /** Unique across calendars and recurrence instances; use it as a key. */
  readonly key: string
  readonly calendarId: string
  readonly summary: string
  readonly description: string | null
  readonly location: string | null
  readonly url: string | null
  /** `kind: "date"` for all-day events. */
  readonly start: EventTime
  /** Exclusive: an all-day event on 3 May ends on 4 May. */
  readonly end: EventTime
  /** First and last day the event occupies in the viewer's zone, inclusive. */
  readonly firstDay: Temporal.PlainDate
  readonly lastDay: Temporal.PlainDate
  /** Wallclock minutes from the midnight that begins `firstDay` to the start. */
  readonly startMinutes: number
  /** Wallclock minutes from that same midnight to the end: past 1440 when it ends on a later day. */
  readonly endMinutes: number
  readonly status: WireEvent["status"]
  /** `"free"` for events that don't block time. */
  readonly availability: WireEvent["availability"]
  /** The user's response when they're an attendee, otherwise null. */
  readonly rsvp: WireEvent["rsvp"]
  /**
   * Not a saved event: `"draft"` is the event the user is creating, and
   * `"drag-preview"` a dragged event's copy at its drop position. Draw them
   * like events, but leave them out of counts; they can't be opened.
   */
  readonly transient: WireEvent["transient"]
  /** Open in the popover or selected in the agenda. */
  readonly selected: boolean
  /** Drawn as a bar across days (`layoutAllDay`) rather than at its time (`layoutTimed`). */
  readonly spanning: boolean
  /** Its colors, from its calendar's and the theme. */
  readonly paint: WirePaint
}

export type Calendar = WireCalendar

function call(request: PluginRequest) {
  host.call(`rencal.${request.name}`, request.data).catch((error: unknown) => {
    console.error(`renCal refused ${request.name}`, error)
  })
}

// ---- What renCal sends

const context = signal<WireContext | null>(null)
host.on<WireContext | null>("context", (next) => {
  if (!next) return
  if (next.viewerTzid !== getViewerTzid()) setViewerTzid(next.viewerTzid)
  context.set(next)
})

// renCal's theme, applied here as renCal applies it: tokens, faces and surfaces.
host.on<WireTheme | null>("theme", (theme) => {
  if (theme) void applyTheme(theme.overrides, theme.mode)
})

const held = signal<WireEvents | null>(null)
host.on<WireEvents | null>("events", (next) => held.set(next))

const ctx = () => {
  const value = context()
  if (!value) throw new Error("renCal's state isn't here yet: start the view with mountView")
  return value
}

provideCalendarPrefs({
  today: () => today(),
  firstDayOfWeek: () => ctx().firstDayOfWeek,
  showWeekNumbers: () => ctx().showWeekNumbers,
})

/** Starts the plugin's view once renCal has sent what it reads. */
export function mountView(View: () => JSX.Element) {
  mount(() => <If when={context() !== null}>{View()}</If>)
}

// ---- Events

const parseTime = ({ kind, value }: WireEventTime): EventTime => {
  switch (kind) {
    case "date":
      return { kind, value: Temporal.PlainDate.from(value) }
    case "datetime_utc":
      return { kind, value: Temporal.Instant.from(value) }
    case "datetime_floating":
      return { kind, value: Temporal.PlainDateTime.from(value) }
    case "datetime_zoned":
      return { kind, value: Temporal.ZonedDateTime.from(value) }
  }
}

// Unchanged events keep their object across messages, so lists keep their rows.
let parsed = new Map<string, { json: string; event: CalendarEvent }>()

function parseEvent(wire: WireEvent, json: string): CalendarEvent {
  const known = parsed.get(wire.key)
  if (known?.json === json) return known.event
  return {
    ...wire,
    start: parseTime(wire.start),
    end: parseTime(wire.end),
    firstDay: Temporal.PlainDate.from(wire.firstDay),
    lastDay: Temporal.PlainDate.from(wire.lastDay),
  }
}

const allEvents = computed((): readonly CalendarEvent[] => {
  const next = new Map<string, { json: string; event: CalendarEvent }>()
  const events = (held()?.events ?? []).map((wire) => {
    const json = JSON.stringify(wire)
    const event = parseEvent(wire, json)
    next.set(wire.key, { json, event })
    return event
  })
  parsed = next
  return events
})

/**
 * The events overlapping [start, end), visible calendars only, in start
 * order, with the event the user is creating and a dragged event's preview
 * (`transient`). Keeps the range loaded while the view is up; a view holds one
 * range at a time.
 */
export function eventsInRange(
  start: () => Temporal.PlainDate,
  end: () => Temporal.PlainDate,
): () => readonly CalendarEvent[] {
  let asked = ""
  effect(() => {
    const range = { start: start().toString(), end: end().toString() }
    const key = `${range.start}/${range.end}`
    if (key === asked) return
    asked = key
    call({ name: "holdRange", data: range })
  })
  const events = computed(() => {
    const first = epochDay(start())
    const last = epochDay(end())
    return allEvents().filter(
      (event) => epochDay(event.lastDay) >= first && epochDay(event.firstDay) < last,
    )
  })
  return events
}

/**
 * Opens the event's popover beside `ref` (or closes it if it's open): renCal
 * draws it over its whole window. Transient events don't open.
 */
export async function openEvent(event: CalendarEvent, ref: ViewRef | undefined) {
  if (event.transient) return
  const measured = await ref?.measure()
  const position = measured?.pagePosition ?? { x: 0, y: 0 }
  const size = measured?.bounds.size ?? { width: 0, height: 0 }
  call({
    name: "openEvent",
    data: { key: event.key, bounds: { ...position, width: size.width, height: size.height } },
  })
}

// ---- Navigation and settings

/**
 * A date field of the context as a `PlainDate` that keeps its identity while
 * the day stays. Computeds run when made, before renCal has sent anything.
 */
function contextDate(field: "activeDate" | "today") {
  const date = computed(
    () => {
      const iso = context()?.[field]
      return iso ? Temporal.PlainDate.from(iso) : null
    },
    { equals: (a, b) => a === b || (a != null && b != null && a.equals(b)) },
  )
  // Without a context, `ctx` says why.
  return () => date() ?? Temporal.PlainDate.from(ctx()[field])
}

/** The selected date, which renCal's Today button and other navigation move. */
export const activeDate = contextDate("activeDate")

/** Selects `date` in renCal, as its own navigation does. */
export const goToDate = (date: Temporal.PlainDate) =>
  call({ name: "goToDate", data: { date: date.toString() } })

/**
 * Calls `listener` after each deliberate navigation (Today, a search result,
 * `goToDate`), even to the date already selected: bring it into view. Not when
 * the date follows scrolling elsewhere. Stops with the component calling it.
 */
export function onNavigate(listener: (date: Temporal.PlainDate) => void) {
  let seen = -1
  host.on<WireNavigate | null>("navigate", (navigation) => {
    if (!navigation || navigation.version === seen) return
    seen = navigation.version
    listener(Temporal.PlainDate.from(navigation.date))
  })
}

/** Today in the viewer's zone; changes at midnight. */
export const today = contextDate("today")

/** The viewer's IANA zone. */
export const viewerTzid = () => ctx().viewerTzid

/**
 * The user's time format, first day of the week, whether to number weeks,
 * and the zones (at most two) to show times in next to the viewer's own.
 */
export const displaySettings = () => {
  const { timeFormat, firstDayOfWeek, showWeekNumbers, extraTimeZones } = ctx()
  return { timeFormat, firstDayOfWeek, showWeekNumbers, extraTimeZones }
}

/** Every calendar, in the user's order; only visible ones' events come. */
export const calendars = (): readonly Calendar[] => ctx().calendars

/** While the user types a new event in the header, other events fade. */
export const dimmed = () => ctx().dimmed
