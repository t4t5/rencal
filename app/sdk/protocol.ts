/*
 * What renCal and a view plugin say to each other, as JSON. The plugin runs
 * in an engine of its own (`native/src/plugin_view.rs`), so nothing crosses
 * but these messages: renCal sends `theme`, `context`, `events` and `navigate`
 * as host events, and the plugin calls `rencal.<name>` for each `PluginRequest`.
 *
 * This is the contract plugins depend on, whatever draws renCal: grow it
 * deliberately and bump `PLUGIN_API` when a change breaks it.
 */
export const PLUGIN_API = 1

/** A `CalendarEvent`'s start or end: the Temporal value as its ISO string. */
export type WireEventTime = {
  kind: "date" | "datetime_utc" | "datetime_floating" | "datetime_zoned"
  value: string
}

/** An event's colors, from its calendar's and the theme. */
export type WirePaint = {
  /** The marker and dots. */
  color: string
  /** A filled block. */
  fill: string
  selectedFill: string
  /** Text on the fill. */
  foreground: string
  /** A time beside the title, tinted to the calendar. */
  tinted: string
}

export type WireEvent = {
  key: string
  calendarId: string
  summary: string
  description: string | null
  location: string | null
  url: string | null
  start: WireEventTime
  end: WireEventTime
  /** ISO dates, inclusive, in the viewer's zone. */
  firstDay: string
  lastDay: string
  startMinutes: number
  endMinutes: number
  status: "confirmed" | "tentative" | "cancelled"
  availability: "busy" | "free"
  rsvp: "accepted" | "declined" | "tentative" | "needs-action" | null
  transient: "draft" | "drag-preview" | null
  /** Open in the popover or selected in the agenda. */
  selected: boolean
  /**
   * Drawn as a bar across days rather than at its time: all-day events, and
   * timed ones covering a whole day. One that only crosses midnight isn't.
   */
  spanning: boolean
  paint: WirePaint
}

export type WireCalendar = { id: string; name: string; color: string; visible: boolean }

/** Everything but the events: the `context` host event. */
export type WireContext = {
  api: number
  activeDate: string
  today: string
  viewerTzid: string
  timeFormat: "12h" | "24h"
  firstDayOfWeek: "monday" | "sunday"
  showWeekNumbers: boolean
  extraTimeZones: string[]
  calendars: WireCalendar[]
  /** While the user types a new event in the header: other events fade. */
  dimmed: boolean
}

/** The `events` host event: the events of the range the plugin holds. */
export type WireEvents = { start: string; end: string; events: WireEvent[] }

/** The `navigate` host event: a deliberate move to `date` (Today, a search result). */
export type WireNavigate = { date: string; version: number }

/** The `theme` host event: renCal's theme variables, which the SDK applies as renCal does. */
export type WireTheme = { overrides: Record<string, string>; mode: "light" | "dark" }

/** A rect in the plugin's own coordinates, as `measure().pagePosition` gives them. */
export type WireBounds = { x: number; y: number; width: number; height: number }

export type PluginRequest =
  | { name: "goToDate"; data: { date: string } }
  | { name: "openEvent"; data: { key: string; bounds: WireBounds } }
  | { name: "holdRange"; data: { start: string; end: string } }
