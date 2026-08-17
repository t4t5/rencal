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

export {
  DAY_MINUTES,
  DEFAULT_DURATION_MINS,
  HOUR_MINUTES,
  MONTH_MINUTES,
  WEEK_MINUTES,
} from "./constants"
export { allDayDate, atTime, fromDate, nowZoned, today } from "./constructors"
export { dateKeyToPlainDate, epochDay, startOfWeek } from "./day"
export {
  formatDateKey,
  formatDayMonth,
  formatLongDate,
  formatMonth,
  formatShortDate,
  formatTime,
  formatWallclockTime,
  formatWeekday,
  getRelativeDayLabel,
} from "./display"
export {
  addDays,
  addMinutes,
  dateInEventZone,
  toAllDay,
  toTimedAtStartOfDay,
  wallclockTime,
  withViewerZone,
} from "./edit"
export { getViewerTzid, setViewerTzid, subscribeViewerTzid } from "./local-zone"
export { computeEventDateInfo } from "./layout"
export { dateInViewerZone, isAllDay, isSameDay, toViewerZonedDateTime } from "./projections"
export {
  coversFullDay,
  displayEndDate,
  enumerateLocalDays,
  normalizeAllDayRange,
  shouldShowDisplayEndDate,
  withRangeDisplayEndDate,
  withRangeEndWallclockTime,
  withRangeStartDate,
  withRangeStartWallclockTime,
} from "./range"
