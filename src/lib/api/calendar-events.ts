/*
 * App-facing calendar event operations. This is the only place that turns app
 * event values (EventTime, Recurrence, EventConference) into their RPC wire
 * shapes and back, so callers never see RpcEventTime or the generated
 * CalendarEvent. Failures are left as `unknown` for `@/lib/api/errors`.
 */
import { Temporal } from "@js-temporal/polyfill"

import { rpc } from "@/rpc"
import type { CreateEventInput as RpcCreateEventInput } from "@/rpc/bindings"

import {
  recurrenceToRpc,
  rpcToCalendarEvent,
  rpcToCalendarEvents,
  type CalendarEvent,
  type EventAttendee,
  type Recurrence,
  type ResponseStatus,
} from "@/lib/cal-events"
import { conferenceToRpc, type EventConference } from "@/lib/conference"
import { getViewerTzid, type EventTime } from "@/lib/event-time"
import { toRpcEventTime } from "@/lib/event-time/rpc"

/** The editable fields shared by event creation and updates. */
export interface EventInput {
  summary: string
  description: string | null
  location: string | null
  url: string | null
  start: EventTime
  end: EventTime
  recurrence: Recurrence | null
  reminders: number[]
  attendees: EventAttendee[]
  conference: EventConference | null
}

export interface CreateEventInput extends EventInput {
  calendar_slug: string
}

export interface UpdateEventInput extends EventInput {
  id: string
  calendar_slug: string
  /** If set and different from `calendar_slug`, moves the event to this calendar. */
  new_calendar_slug: string | null
}

/**
 * Splits a recurring series at one instance: the master's rule ends before
 * `split_start` and a new master starting there carries `new_recurrence`
 * (null for a single non-recurring event). Returns the new master.
 */
export interface SplitRecurringSeriesInput {
  calendar_slug: string
  master_uid: string
  split_start: EventTime
  split_end: EventTime
  new_recurrence: Recurrence | null
}

function eventInputToRpc(input: EventInput): Omit<RpcCreateEventInput, "calendar_slug"> {
  return {
    summary: input.summary,
    description: input.description,
    location: input.location,
    url: input.url,
    start: toRpcEventTime(input.start),
    end: toRpcEventTime(input.end),
    recurrence: input.recurrence ? recurrenceToRpc(input.recurrence) : null,
    reminders: input.reminders,
    attendees: input.attendees,
    conference: conferenceToRpc(input.conference),
  }
}

/** Convert a viewer-zone day boundary to the UTC instant expected by the RPC. */
function plainDateToUtcInstant(date: Temporal.PlainDate): string {
  return date.toZonedDateTime(getViewerTzid()).toInstant().toString()
}

/** Events overlapping `[start, end)` in viewer-zone days. Malformed events are skipped. */
export async function getCalendarEventsForRange(
  calendarSlugs: string[],
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
): Promise<CalendarEvent[]> {
  const events = await rpc.caldir.list_events(
    calendarSlugs,
    plainDateToUtcInstant(start),
    plainDateToUtcInstant(end),
  )
  return rpcToCalendarEvents(events)
}

export async function getEvent(
  calendarSlug: string,
  eventId: string,
): Promise<CalendarEvent | null> {
  const event = await rpc.caldir.get_event(calendarSlug, eventId)
  return event ? rpcToCalendarEvent(event) : null
}

/** Look an event up by UID across all calendars, e.g. from a deep link. */
export async function findEvent(
  uid: string,
  recurrenceId: string | null,
): Promise<CalendarEvent | null> {
  const event = await rpc.caldir.find_event(uid, recurrenceId)
  return event ? rpcToCalendarEvent(event) : null
}

export async function searchEvents(
  calendarSlugs: string[],
  query: string,
): Promise<CalendarEvent[]> {
  return rpcToCalendarEvents(await rpc.caldir.search_events(calendarSlugs, query))
}

/** Invitations awaiting a response on the given calendars. */
export async function listInvites(calendarSlugs: string[]): Promise<CalendarEvent[]> {
  return rpcToCalendarEvents(await rpc.caldir.list_invites(calendarSlugs))
}

/** Creates the event and returns it as stored. Recurring creates return only the master. */
export async function createEvent(input: CreateEventInput): Promise<CalendarEvent> {
  const created = await rpc.caldir.create_event({
    calendar_slug: input.calendar_slug,
    ...eventInputToRpc(input),
  })
  return rpcToCalendarEvent(created)
}

export async function updateEvent(input: UpdateEventInput): Promise<void> {
  await rpc.caldir.update_event({
    id: input.id,
    calendar_slug: input.calendar_slug,
    new_calendar_slug: input.new_calendar_slug,
    ...eventInputToRpc(input),
  })
}

export async function deleteEvent(calendarSlug: string, eventId: string): Promise<void> {
  await rpc.caldir.delete_event(calendarSlug, eventId)
}

export async function deleteRecurringSeries(calendarSlug: string, uid: string): Promise<void> {
  await rpc.caldir.delete_recurring_series(calendarSlug, uid)
}

export async function splitRecurringSeriesAt(
  input: SplitRecurringSeriesInput,
): Promise<CalendarEvent> {
  const newMaster = await rpc.caldir.split_recurring_series_at({
    calendar_slug: input.calendar_slug,
    master_uid: input.master_uid,
    split_start: toRpcEventTime(input.split_start),
    split_end: toRpcEventTime(input.split_end),
    new_recurrence: input.new_recurrence ? recurrenceToRpc(input.new_recurrence) : null,
  })
  return rpcToCalendarEvent(newMaster)
}

export async function rsvp(
  calendarSlug: string,
  eventId: string,
  response: ResponseStatus,
): Promise<void> {
  await rpc.caldir.rsvp(calendarSlug, eventId, response)
}
