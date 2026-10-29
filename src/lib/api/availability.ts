/*
 * Saved availabilities and what core makes of them. Spans cross the boundary
 * as UTC RFC 3339 strings and are converted to `Temporal.Instant` here, once.
 */
import { Temporal } from "@js-temporal/polyfill"

import { rpc } from "@/rpc"
import type {
  AvailabilityDetails,
  AvailabilityDraft,
  AvailabilitySummary,
  DayHours,
  PreviewSource,
  Span,
  TimeRange,
  Weekday,
} from "@/rpc/bindings"

export type {
  AvailabilityDetails,
  AvailabilityDraft,
  AvailabilitySummary,
  DayHours,
  TimeRange,
  Weekday,
}

export type InstantSpan = { start: Temporal.Instant; end: Temporal.Instant }

/** What to evaluate: a saved file, an edited draft (over its file when `id` is set), or picked times. */
export type AvailabilitySource =
  | { kind: "saved"; id: string }
  | { kind: "draft"; id: string | null; draft: AvailabilityDraft }
  | { kind: "ranges"; ranges: InstantSpan[]; tzid: string }

export type AvailabilityPreview = {
  /** Your hours from the notice cutoff on, before busy. */
  available: InstantSpan[]
  /** Busy time where it falls inside your hours. */
  busy: InstantSpan[]
  /** Bookable windows. */
  free: InstantSpan[]
}

const toSpan = ({ start, end }: InstantSpan): Span => ({
  start: start.toString(),
  end: end.toString(),
})

const fromSpan = ({ start, end }: Span): InstantSpan => ({
  start: Temporal.Instant.from(start),
  end: Temporal.Instant.from(end),
})

function toRpcSource(source: AvailabilitySource): PreviewSource {
  return source.kind === "ranges"
    ? { kind: "ranges", ranges: source.ranges.map(toSpan), tzid: source.tzid }
    : source
}

export function listAvailabilities(): Promise<AvailabilitySummary[]> {
  return rpc.caldir.list_availabilities()
}

/** Slugs of the availability directories; a new availability needs one picked when there are several. */
export function listAvailabilityDirs(): Promise<string[]> {
  return rpc.caldir.list_availability_dirs()
}

export function getAvailability(id: string): Promise<AvailabilityDetails> {
  return rpc.caldir.get_availability(id)
}

/** Writes the file and returns its id. */
export function createAvailability(
  draft: AvailabilityDraft,
  dir: string | null = null,
): Promise<string> {
  return rpc.caldir.create_availability(draft, dir)
}

export async function updateAvailability(id: string, draft: AvailabilityDraft): Promise<void> {
  await rpc.caldir.update_availability(id, draft)
}

export async function deleteAvailability(id: string): Promise<void> {
  await rpc.caldir.delete_availability(id)
}

/** Hours, busy and bookable windows in `[from, to)`; busy comes from `calendarSlugs`. */
export async function previewAvailability(
  source: AvailabilitySource,
  calendarSlugs: string[],
  from: Temporal.Instant,
  to: Temporal.Instant,
): Promise<AvailabilityPreview> {
  const preview = await rpc.caldir.preview_availability(
    toRpcSource(source),
    calendarSlugs,
    from.toString(),
    to.toString(),
  )
  return {
    available: preview.available.map(fromSpan),
    busy: preview.busy.map(fromSpan),
    free: preview.free.map(fromSpan),
  }
}

/** Free times as `caldir free` formats them, in `tzid` (the availability's own zone when null). */
export function freeTimesText(
  source: AvailabilitySource,
  calendarSlugs: string[],
  tzid: string | null,
): Promise<string> {
  return rpc.caldir.free_times_text(toRpcSource(source), calendarSlugs, tzid)
}

export const availability = {
  list: listAvailabilities,
  listDirs: listAvailabilityDirs,
  get: getAvailability,
  create: createAvailability,
  update: updateAvailability,
  delete: deleteAvailability,
  preview: previewAvailability,
  freeTimesText,
} as const
