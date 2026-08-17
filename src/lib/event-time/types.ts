import { Temporal } from "@js-temporal/polyfill"

export type EventTime =
  | { kind: "date"; value: Temporal.PlainDate }
  | { kind: "datetime_utc"; value: Temporal.Instant }
  | { kind: "datetime_floating"; value: Temporal.PlainDateTime }
  | { kind: "datetime_zoned"; value: Temporal.ZonedDateTime }

export type EventTimeRange = {
  start: EventTime
  end: EventTime
}

export type EventDateInfo = {
  /** Start projection in epoch ms; used as a sort key. */
  startMs: number
  /** Epoch-day key for the start's day in the viewer's zone. */
  firstDay: number
  /** Epoch-day key for the last occupied day, iCal-end-exclusive aware. */
  lastDay: number
  /** Epoch-day key for the end's day, before iCal adjustment. */
  endDay: number
  /** Wallclock minutes-of-day at start, in the viewer's zone. */
  startLocalMinutes: number
  /** Wallclock minutes-of-day at end, in the viewer's zone. */
  endLocalMinutes: number
}
