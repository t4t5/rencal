/*
 * Event time primitives for rencal.
 *
 * Calendar data is not one kind of time. EventTime keeps the four shapes that
 * calendar formats actually use:
 *
 * - "date": an all-day calendar date with no clock and no zone.
 * - "datetime_floating": a wallclock date/time with no zone.
 * - "datetime_zoned": wallclock date/time plus an IANA timezone.
 * - "datetime_utc": a genuine UTC instant.
 *
 * App code should use the helpers exported here instead of directly converting
 * to Date, ISO strings, or UTC instants. RPC serialization lives in
 * ./rpc so transport details stay out of normal UI code.
 */
export type { EventDateInfo, EventTime, EventTimeRange } from "./types"

export { allDayDate, allDayFromLocalDate, fromDate, nowZoned, plainDate } from "./constructors"
export {
  formatDateKey,
  formatShortDate,
  formatTime,
  getRelativeDayLabel,
  localDateToPlainDate,
  plainDateToLocalDate,
} from "./display"
export {
  addDays,
  addMinutes,
  dateInEventZone,
  toAllDay,
  toTimedAtStartOfDay,
  wallclockTime,
  withEventDate,
  withWallclockTime,
} from "./edit"
export { getLocalTzid } from "./local-zone"
export { computeEventDateInfo, getEventDayRange, MS_PER_DAY, startOfDayMs } from "./layout"
export {
  dateInViewerZone,
  instantForOrdering,
  isAllDay,
  isSameDay,
  toInteropDate,
  toViewerZonedDateTime,
} from "./projections"
export {
  displayEndDate,
  enumerateLocalDateKeys,
  normalizeAllDayRange,
  shouldShowDisplayEndDate,
  withRangeDisplayEndDate,
  withRangeEndWallclockTime,
  withRangeStartDate,
  withRangeStartWallclockTime,
} from "./range"
