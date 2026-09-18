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

/** A calendar-scoped event identity. Event ids are opaque. */
export type EventRef = Pick<CalendarEvent, "calendar_slug" | "id">

export interface EventRange {
  start: Temporal.PlainDate
  end: Temporal.PlainDate
}

export interface ListEventsParams {
  calendar_slugs: string[]
  /** Viewer-zone day boundaries in the half-open interval `[start, end)`. */
  range: EventRange
}

export interface SearchEventsParams {
  calendar_slugs: string[]
  query: string
}

export interface ListInvitesParams {
  calendar_slugs: string[]
}

/** The complete editable record used by the app's legacy replacement path. */
export interface EventReplacement {
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

/**
 * Event creation parameters. Optional values have explicit, side-effect-free
 * defaults: nullable fields become `null`, and collections become `[]`.
 */
export interface CreateEventParams {
  calendar_slug: string
  summary: string
  start: EventTime
  end: EventTime
  description?: string | null
  location?: string | null
  url?: string | null
  recurrence?: Recurrence | null
  reminders?: number[]
  attendees?: EventAttendee[]
  conference?: EventConference | null
}

export interface ReplaceEventInput extends EventReplacement {
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

function eventInputToRpc(input: EventReplacement): Omit<RpcCreateEventInput, "calendar_slug"> {
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
export async function listEvents({
  calendar_slugs,
  range,
}: ListEventsParams): Promise<CalendarEvent[]> {
  if (calendar_slugs.length === 0) return []
  const events = await rpc.caldir.list_events(
    calendar_slugs,
    plainDateToUtcInstant(range.start),
    plainDateToUtcInstant(range.end),
  )
  return rpcToCalendarEvents(events)
}

export async function getStoredEvent(ref: EventRef): Promise<CalendarEvent | null> {
  const event = await rpc.caldir.get_event(ref.calendar_slug, ref.id)
  return event ? rpcToCalendarEvent(event) : null
}

/** Look an event up by UID across all calendars, e.g. from a deep link. */
export async function findEventByUid(
  uid: string,
  recurrenceId: string | null,
): Promise<CalendarEvent | null> {
  const event = await rpc.caldir.find_event(uid, recurrenceId)
  return event ? rpcToCalendarEvent(event) : null
}

export async function searchEvents({
  calendar_slugs,
  query,
}: SearchEventsParams): Promise<CalendarEvent[]> {
  return rpcToCalendarEvents(await rpc.caldir.search_events(calendar_slugs, query))
}

/** Invitations awaiting a response on the given calendars. */
export async function listInvites({ calendar_slugs }: ListInvitesParams): Promise<CalendarEvent[]> {
  return rpcToCalendarEvents(await rpc.caldir.list_invites(calendar_slugs))
}

/** Creates the event and returns it as stored. Recurring creates return only the master. */
export async function createEvent(input: CreateEventParams): Promise<CalendarEvent> {
  const completeInput: EventReplacement = {
    summary: input.summary,
    description: input.description ?? null,
    location: input.location ?? null,
    url: input.url ?? null,
    start: input.start,
    end: input.end,
    recurrence: input.recurrence ?? null,
    reminders: input.reminders ?? [],
    attendees: input.attendees ?? [],
    conference: input.conference ?? null,
  }
  const created = await rpc.caldir.create_event({
    calendar_slug: input.calendar_slug,
    ...eventInputToRpc(completeInput),
  })
  return rpcToCalendarEvent(created)
}

export async function replaceEvent(input: ReplaceEventInput): Promise<void> {
  await rpc.caldir.update_event({
    id: input.id,
    calendar_slug: input.calendar_slug,
    new_calendar_slug: input.new_calendar_slug,
    ...eventInputToRpc(input),
  })
}

export async function deleteEvent(ref: EventRef): Promise<void> {
  await rpc.caldir.delete_event(ref.calendar_slug, ref.id)
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

export async function respondToEvent(ref: EventRef, response: ResponseStatus): Promise<void> {
  await rpc.caldir.rsvp(ref.calendar_slug, ref.id, response)
}

export const events = {
  list: listEvents,
  findByUid: findEventByUid,
  search: searchEvents,
  listInvites,
  create: createEvent,
  delete: deleteEvent,
  respond: respondToEvent,
} as const
