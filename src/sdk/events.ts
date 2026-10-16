import type { Temporal } from "@js-temporal/polyfill"

import type { Calendar } from "@/lib/api"
import {
  type CalendarEvent as AppEvent,
  type EventAvailability,
  type EventStatus,
  eventKey,
  type ResponseStatus,
} from "@/lib/cal-events"
import { epochDay, type EventTime, plainDateFromEpochDay } from "@/lib/event-time"
import { getUserResponseStatus } from "@/lib/event-utils"

// The event shape plugins see. A curated subset of the app's event, so RPC and
// event-time refactors don't break plugins. Add fields deliberately.
export interface CalendarEvent {
  /** Unique across calendars and recurrence instances; use it as a React key. */
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
  readonly status: EventStatus
  /** `"free"` for events that don't block time (TRANSP:TRANSPARENT). */
  readonly availability: EventAvailability
  /** The user's response when they're an attendee, otherwise null. */
  readonly rsvp: ResponseStatus | null
}

// Cached both ways so a plugin event keeps its identity across renders and the
// host can get back to the app event.
const pluginEvents = new WeakMap<AppEvent, CalendarEvent>()
const appEvents = new WeakMap<CalendarEvent, AppEvent>()

function toPluginEvent(event: AppEvent, calendars: Calendar[]): CalendarEvent {
  const rsvp = getUserResponseStatus(event, calendars)
  let pluginEvent = pluginEvents.get(event)
  // The RSVP depends on the calendar's email too, so rebuild when that changes it.
  if (!pluginEvent || pluginEvent.rsvp !== rsvp) {
    const { firstDay, lastDay } = event.dateInfo
    pluginEvent = {
      key: eventKey(event),
      calendarId: event.calendar_slug,
      summary: event.summary,
      description: event.description,
      location: event.location,
      url: event.url,
      start: event.start,
      end: event.end,
      firstDay: plainDateFromEpochDay(firstDay),
      lastDay: plainDateFromEpochDay(Math.max(firstDay, lastDay)),
      status: event.status,
      availability: event.availability,
      rsvp,
    }
    pluginEvents.set(event, pluginEvent)
    appEvents.set(pluginEvent, event)
  }
  return pluginEvent
}

// Plugin events in start order.
export function toPluginEvents(
  events: readonly AppEvent[],
  calendars: Calendar[],
): CalendarEvent[] {
  return [...events]
    .sort((a, b) => a.dateInfo.startMs - b.dateInfo.startMs)
    .map((event) => toPluginEvent(event, calendars))
}

export function toAppEvent(event: CalendarEvent): AppEvent {
  const appEvent = appEvents.get(event)
  if (!appEvent) throw new Error("Expected an event from useEventsInRange")
  return appEvent
}

export interface EventDay {
  readonly date: Temporal.PlainDate
  /** Events covering the day, in the order given; multi-day events repeat on each day. */
  readonly events: readonly CalendarEvent[]
}

/** One entry for each day in [start, end), including days without events. */
export function eventsByDay(
  events: readonly CalendarEvent[],
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
): EventDay[] {
  const first = epochDay(start)
  const count = Math.max(0, epochDay(end) - first)
  const days = Array.from({ length: count }, (_, i) => ({
    date: plainDateFromEpochDay(first + i),
    events: [] as CalendarEvent[],
  }))
  for (const event of events) {
    const from = Math.max(epochDay(event.firstDay), first)
    const to = Math.min(epochDay(event.lastDay), first + count - 1)
    for (let day = from; day <= to; day++) days[day - first].events.push(event)
  }
  return days
}
