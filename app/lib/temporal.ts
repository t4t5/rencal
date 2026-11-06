/*
 * The part of Temporal renCal uses, in place of @js-temporal/polyfill.
 *
 * QuickJS has no Temporal, and its Intl knows only the device's zone and UTC,
 * so the polyfill can't run. Calendar math is plain ISO arithmetic here; named
 * zones come from chrono-tz through `Backend`. `nsh.json` aliases the polyfill
 * to this file, so `src/lib` imports it unchanged.
 */
import { Backend } from "rencal/native"

const MS_PER_DAY = 86_400_000

let fixedNow: number | null = null

/** Pins `Temporal.Now`, for tests. */
export function setNow(epochMs: number | null) {
  fixedNow = epochMs
}

const nowMs = () => fixedNow ?? Date.now()

type DateLike = { year: number; month: number; day: number }
type TimeLike = {
  hour?: number
  minute?: number
  second?: number
  millisecond?: number
}
type DurationLike = {
  years?: number
  months?: number
  weeks?: number
  days?: number
  hours?: number
  minutes?: number
  seconds?: number
  milliseconds?: number
}
type Unit =
  | "year"
  | "month"
  | "week"
  | "day"
  | "hour"
  | "minute"
  | "second"
  | "millisecond"
  | "years"
  | "months"
  | "weeks"
  | "days"
  | "hours"
  | "minutes"
  | "seconds"
  | "milliseconds"
type DifferenceOptions = { largestUnit?: Unit }

const pad = (n: number, width = 2) => String(Math.abs(n)).padStart(width, "0")
const singular = (unit: Unit) => unit.replace(/s$/, "")

// Howard Hinnant's civil-date algorithms; day 0 is 1970-01-01.
function epochDayOf(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yearOfEra = y - era * 400
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
  return era * 146097 + dayOfEra - 719468
}

function civilOf(epochDay: number): DateLike {
  const z = epochDay + 719468
  const era = Math.floor(z / 146097)
  const dayOfEra = z - era * 146097
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  )
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const mp = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1
  const month = mp < 10 ? mp + 3 : mp - 9
  return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day }
}

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

function monthLength(year: number, month: number): number {
  if (month === 2) return isLeap(year) ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

function addToDate(date: DateLike, d: DurationLike): DateLike {
  const months = date.year * 12 + (date.month - 1) + (d.years ?? 0) * 12 + (d.months ?? 0)
  const year = Math.floor(months / 12)
  const month = months - year * 12 + 1
  const day = Math.min(date.day, monthLength(year, month))
  return civilOf(epochDayOf(year, month, day) + (d.weeks ?? 0) * 7 + (d.days ?? 0))
}

const timeMs = (d: DurationLike) =>
  (d.hours ?? 0) * 3_600_000 +
  (d.minutes ?? 0) * 60_000 +
  (d.seconds ?? 0) * 1000 +
  (d.milliseconds ?? 0)

function negated(d: DurationLike): DurationLike {
  return Object.fromEntries(Object.entries(d).map(([key, value]) => [key, -value]))
}

const DATE_RE = /^([+-]\d{6}|\d{4})-?(\d{2})-?(\d{2})/
const TIME_RE = /[T ](\d{2})(?::?(\d{2}))?(?::?(\d{2}))?(?:[.,](\d{1,9}))?/
const OFFSET_RE = /(Z|[+-]\d{2}(?::?\d{2})?)(?:\[|$)/i
const ZONE_RE = /\[(?:!)?([^\]=]+)\]/

function parseDate(text: string): DateLike {
  const match = DATE_RE.exec(text)
  if (!match) throw new RangeError(`invalid ISO date: ${text}`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function parseTime(text: string): Required<TimeLike> {
  const match = TIME_RE.exec(text)
  return {
    hour: Number(match?.[1] ?? 0),
    minute: Number(match?.[2] ?? 0),
    second: Number(match?.[3] ?? 0),
    millisecond: Number((match?.[4] ?? "").padEnd(3, "0").slice(0, 3)),
  }
}

function parseOffsetMs(text: string): number | null {
  const match = OFFSET_RE.exec(text)?.[1]
  if (!match) return null
  if (match.toUpperCase() === "Z") return 0
  const sign = match[0] === "-" ? -1 : 1
  const digits = match.slice(1).replace(":", "")
  return sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || 0)) * 60_000
}

function formatTime(t: Required<TimeLike>, smallestUnit?: Unit): string {
  const unit = smallestUnit && singular(smallestUnit)
  if (unit === "minute") return `${pad(t.hour)}:${pad(t.minute)}`
  const fraction = t.millisecond && unit !== "second" ? `.${pad(t.millisecond, 3)}` : ""
  return `${pad(t.hour)}:${pad(t.minute)}:${pad(t.second)}${fraction}`
}

function formatOffset(ms: number): string {
  const sign = ms < 0 ? "-" : "+"
  const minutes = Math.abs(ms) / 60_000
  return `${sign}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

// "UTC" and fixed offsets skip the native call; they're most of what display code asks.
function zoneOffsetMs(zone: string, epochMs: number): number {
  if (zone === "UTC") return 0
  const fixed = /^[+-]/.test(zone) ? parseOffsetMs(zone) : null
  if (fixed !== null) return fixed
  const offset = Backend.zoneOffsetMs(zone, epochMs)
  if (offset === null) throw new RangeError(`unknown time zone: ${zone}`)
  return offset
}

/** Temporal's "compatible" disambiguation: the later side of a gap, the earlier of a fold. */
function localToEpochMs(zone: string, localMs: number): number {
  if (zone === "UTC") return localMs
  if (/^[+-]/.test(zone)) return localMs - zoneOffsetMs(zone, 0)
  const instants = Backend.zoneInstantsMs(zone, localMs)
  if (instants.length > 0) return Math.min(...instants)
  return localMs - zoneOffsetMs(zone, localMs - MS_PER_DAY)
}

function assertZone(zone: string): string {
  // The offset lookup throws for a zone it doesn't know.
  zoneOffsetMs(zone, 0)
  return zone
}

class DurationValue {
  readonly years: number
  readonly months: number
  readonly weeks: number
  readonly days: number
  readonly hours: number
  readonly minutes: number
  readonly seconds: number
  readonly milliseconds: number

  constructor(d: DurationLike) {
    this.years = d.years ?? 0
    this.months = d.months ?? 0
    this.weeks = d.weeks ?? 0
    this.days = d.days ?? 0
    this.hours = d.hours ?? 0
    this.minutes = d.minutes ?? 0
    this.seconds = d.seconds ?? 0
    this.milliseconds = d.milliseconds ?? 0
  }

  /** The length in `unit`, for durations without calendar units. */
  total(options: Unit | { unit: Unit }): number {
    const unit = singular(typeof options === "string" ? options : options.unit)
    const ms = (this.weeks * 7 + this.days) * MS_PER_DAY + timeMs(this)
    const per: Record<string, number> = {
      week: 7 * MS_PER_DAY,
      day: MS_PER_DAY,
      hour: 3_600_000,
      minute: 60_000,
      second: 1000,
      millisecond: 1,
    }
    if (!(unit in per)) throw new RangeError(`cannot total a duration in ${unit}`)
    return ms / per[unit]!
  }

  get sign(): number {
    const parts = [
      this.years,
      this.months,
      this.weeks,
      this.days,
      this.hours,
      this.minutes,
      this.seconds,
      this.milliseconds,
    ]
    return Math.sign(parts.find((part) => part !== 0) ?? 0)
  }

  negated(): DurationValue {
    return new DurationValue(negated(this))
  }

  abs(): DurationValue {
    return this.sign < 0 ? this.negated() : this
  }
}

/** Splits `ms` over `largest` and the units below it. */
function timeDuration(ms: number, largest: string): DurationValue {
  const sign = ms < 0 ? -1 : 1
  let rest = Math.abs(ms)
  const take = (size: number) => {
    const whole = Math.floor(rest / size)
    rest -= whole * size
    return sign * whole
  }
  const order = ["day", "hour", "minute", "second", "millisecond"]
  const from = Math.max(order.indexOf(largest), 0)
  const d: DurationLike = {}
  if (from <= 0) d.days = take(MS_PER_DAY)
  if (from <= 1) d.hours = take(3_600_000)
  if (from <= 2) d.minutes = take(60_000)
  if (from <= 3) d.seconds = take(1000)
  d.milliseconds = sign * rest
  return new DurationValue(d)
}

function dateDifference(a: DateLike, b: DateLike, largest: string): DurationValue {
  const days = epochDayOf(b.year, b.month, b.day) - epochDayOf(a.year, a.month, a.day)
  if (largest === "week") {
    return new DurationValue({ weeks: Math.trunc(days / 7), days: days % 7 })
  }
  if (largest !== "year" && largest !== "month") return new DurationValue({ days })

  const sign = days < 0 ? -1 : 1
  let months = (b.year - a.year) * 12 + (b.month - a.month)
  const overshoots = (count: number) => {
    const moved = addToDate(a, { months: count })
    const left = epochDayOf(b.year, b.month, b.day) - epochDayOf(moved.year, moved.month, moved.day)
    return left !== 0 && Math.sign(left) !== sign
  }
  while (months !== 0 && overshoots(months)) months -= sign
  const moved = addToDate(a, { months })
  const rest = epochDayOf(b.year, b.month, b.day) - epochDayOf(moved.year, moved.month, moved.day)
  if (largest === "month") return new DurationValue({ months, days: rest })
  return new DurationValue({
    years: Math.trunc(months / 12),
    months: months % 12,
    days: rest,
  })
}

class PlainTimeValue {
  readonly hour: number
  readonly minute: number
  readonly second: number
  readonly millisecond: number

  constructor(t: TimeLike = {}) {
    this.hour = t.hour ?? 0
    this.minute = t.minute ?? 0
    this.second = t.second ?? 0
    this.millisecond = t.millisecond ?? 0
  }

  static from(value: string | TimeLike): PlainTimeValue {
    if (typeof value !== "string") return new PlainTimeValue(value)
    return new PlainTimeValue(parseTime(`T${value.replace(/^.*[T ]/, "")}`))
  }

  equals(other: string | TimeLike): boolean {
    return this.toString() === PlainTimeValue.from(other).toString()
  }

  toString(): string {
    return formatTime(this)
  }
}

class PlainDateValue {
  readonly year: number
  readonly month: number
  readonly day: number

  constructor(year: number, month: number, day: number) {
    if (month < 1 || month > 12 || day < 1 || day > monthLength(year, month)) {
      throw new RangeError(`invalid date: ${year}-${month}-${day}`)
    }
    this.year = year
    this.month = month
    this.day = day
  }

  static from(value: string | DateLike): PlainDateValue {
    const d = typeof value === "string" ? parseDate(value) : value
    return new PlainDateValue(d.year, d.month, d.day)
  }

  static compare(a: string | DateLike, b: string | DateLike): number {
    const left = PlainDateValue.from(a).epochDay
    const right = PlainDateValue.from(b).epochDay
    return Math.sign(left - right)
  }

  /** Days since 1970-01-01. Not in Temporal; the classes here share it. */
  get epochDay(): number {
    return epochDayOf(this.year, this.month, this.day)
  }

  get dayOfWeek(): number {
    return ((((this.epochDay + 3) % 7) + 7) % 7) + 1
  }

  get dayOfYear(): number {
    return this.epochDay - epochDayOf(this.year, 1, 1) + 1
  }

  get daysInMonth(): number {
    return monthLength(this.year, this.month)
  }

  get daysInYear(): number {
    return isLeap(this.year) ? 366 : 365
  }

  get inLeapYear(): boolean {
    return isLeap(this.year)
  }

  get monthCode(): string {
    return `M${pad(this.month)}`
  }

  /** The ISO week: the one holding this week's Thursday. */
  get weekOfYear(): number {
    const thursday = civilOf(this.epochDay + 4 - this.dayOfWeek)
    return (
      Math.floor((this.epochDay + 4 - this.dayOfWeek - epochDayOf(thursday.year, 1, 1)) / 7) + 1
    )
  }

  get yearOfWeek(): number {
    return civilOf(this.epochDay + 4 - this.dayOfWeek).year
  }

  add(d: DurationLike): PlainDateValue {
    return PlainDateValue.from(addToDate(this, d))
  }

  subtract(d: DurationLike): PlainDateValue {
    return this.add(negated(d))
  }

  with(fields: Partial<DateLike>): PlainDateValue {
    const year = fields.year ?? this.year
    const month = fields.month ?? this.month
    return new PlainDateValue(
      year,
      month,
      Math.min(fields.day ?? this.day, monthLength(year, month)),
    )
  }

  until(other: string | DateLike, options?: DifferenceOptions): DurationValue {
    return dateDifference(this, PlainDateValue.from(other), singular(options?.largestUnit ?? "day"))
  }

  since(other: string | DateLike, options?: DifferenceOptions): DurationValue {
    return dateDifference(PlainDateValue.from(other), this, singular(options?.largestUnit ?? "day"))
  }

  equals(other: string | DateLike): boolean {
    return PlainDateValue.compare(this, other) === 0
  }

  toPlainDateTime(time?: TimeLike | string): PlainDateTimeValue {
    return PlainDateTimeValue.of(this, PlainTimeValue.from(time ?? {}))
  }

  toZonedDateTime(
    zone: string | { timeZone: string; plainTime?: TimeLike | string },
  ): ZonedDateTimeValue {
    if (typeof zone === "string") return this.toPlainDateTime().toZonedDateTime(zone)
    return this.toPlainDateTime(zone.plainTime).toZonedDateTime(zone.timeZone)
  }

  toString(): string {
    return `${pad(this.year, 4)}-${pad(this.month)}-${pad(this.day)}`
  }

  toJSON(): string {
    return this.toString()
  }
}

type DateTimeLike = DateLike & TimeLike

class PlainDateTimeValue {
  readonly date: PlainDateValue
  readonly time: PlainTimeValue

  constructor(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
    millisecond = 0,
  ) {
    this.date = new PlainDateValue(year, month, day)
    this.time = new PlainTimeValue({ hour, minute, second, millisecond })
  }

  static of(date: DateLike, time: TimeLike): PlainDateTimeValue {
    return new PlainDateTimeValue(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
      time.second,
      time.millisecond,
    )
  }

  static from(value: string | DateTimeLike): PlainDateTimeValue {
    if (typeof value === "string") {
      return PlainDateTimeValue.of(parseDate(value), parseTime(value))
    }
    return PlainDateTimeValue.of(value, value)
  }

  static compare(a: string | DateTimeLike, b: string | DateTimeLike): number {
    return Math.sign(PlainDateTimeValue.from(a).localMs - PlainDateTimeValue.from(b).localMs)
  }

  /** The inverse of `localMs`. */
  static fromLocalMs(ms: number): PlainDateTimeValue {
    const epochDay = Math.floor(ms / MS_PER_DAY)
    let rest = ms - epochDay * MS_PER_DAY
    const hour = Math.floor(rest / 3_600_000)
    rest -= hour * 3_600_000
    const minute = Math.floor(rest / 60_000)
    rest -= minute * 60_000
    const second = Math.floor(rest / 1000)
    return PlainDateTimeValue.of(civilOf(epochDay), {
      hour,
      minute,
      second,
      millisecond: rest - second * 1000,
    })
  }

  /** The fields as if they were UTC. Not in Temporal; the classes here share it. */
  get localMs(): number {
    return (
      this.date.epochDay * MS_PER_DAY +
      this.time.hour * 3_600_000 +
      this.time.minute * 60_000 +
      this.time.second * 1000 +
      this.time.millisecond
    )
  }

  get year() {
    return this.date.year
  }
  get month() {
    return this.date.month
  }
  get day() {
    return this.date.day
  }
  get hour() {
    return this.time.hour
  }
  get minute() {
    return this.time.minute
  }
  get second() {
    return this.time.second
  }
  get millisecond() {
    return this.time.millisecond
  }
  get dayOfWeek() {
    return this.date.dayOfWeek
  }

  add(d: DurationLike): PlainDateTimeValue {
    const date = this.date.add(d)
    return PlainDateTimeValue.fromLocalMs(
      PlainDateTimeValue.of(date, this.time).localMs + timeMs(d),
    )
  }

  subtract(d: DurationLike): PlainDateTimeValue {
    return this.add(negated(d))
  }

  with(fields: Partial<DateTimeLike>): PlainDateTimeValue {
    return PlainDateTimeValue.of(this.date.with(fields), {
      hour: fields.hour ?? this.hour,
      minute: fields.minute ?? this.minute,
      second: fields.second ?? this.second,
      millisecond: fields.millisecond ?? this.millisecond,
    })
  }

  until(other: string | DateTimeLike, options?: DifferenceOptions): DurationValue {
    const ms = PlainDateTimeValue.from(other).localMs - this.localMs
    return timeDuration(ms, singular(options?.largestUnit ?? "day"))
  }

  since(other: string | DateTimeLike, options?: DifferenceOptions): DurationValue {
    return PlainDateTimeValue.from(other).until(this, options)
  }

  equals(other: string | DateTimeLike): boolean {
    return PlainDateTimeValue.compare(this, other) === 0
  }

  toPlainDate(): PlainDateValue {
    return this.date
  }

  toPlainTime(): PlainTimeValue {
    return this.time
  }

  toZonedDateTime(zone: string): ZonedDateTimeValue {
    return new ZonedDateTimeValue(localToEpochMs(zone, this.localMs), assertZone(zone))
  }

  toString(options?: { smallestUnit?: Unit }): string {
    return `${this.date.toString()}T${formatTime(this.time, options?.smallestUnit)}`
  }

  toJSON(): string {
    return this.toString()
  }
}

class InstantValue {
  readonly epochMilliseconds: number

  constructor(epochMilliseconds: number) {
    this.epochMilliseconds = epochMilliseconds
  }

  static from(value: string | InstantValue): InstantValue {
    if (typeof value !== "string") return value
    const offset = parseOffsetMs(value)
    if (offset === null) throw new RangeError(`no offset in instant: ${value}`)
    return new InstantValue(PlainDateTimeValue.from(value).localMs - offset)
  }

  static fromEpochMilliseconds(ms: number): InstantValue {
    return new InstantValue(ms)
  }

  static compare(a: string | InstantValue, b: string | InstantValue): number {
    return Math.sign(
      InstantValue.from(a).epochMilliseconds - InstantValue.from(b).epochMilliseconds,
    )
  }

  add(d: DurationLike): InstantValue {
    return new InstantValue(this.epochMilliseconds + timeMs(d))
  }

  subtract(d: DurationLike): InstantValue {
    return this.add(negated(d))
  }

  until(other: string | InstantValue, options?: DifferenceOptions): DurationValue {
    const ms = InstantValue.from(other).epochMilliseconds - this.epochMilliseconds
    return timeDuration(ms, singular(options?.largestUnit ?? "second"))
  }

  since(other: string | InstantValue, options?: DifferenceOptions): DurationValue {
    return InstantValue.from(other).until(this, options)
  }

  equals(other: string | InstantValue): boolean {
    return InstantValue.compare(this, other) === 0
  }

  toZonedDateTimeISO(zone: string): ZonedDateTimeValue {
    return new ZonedDateTimeValue(this.epochMilliseconds, assertZone(zone))
  }

  toString(): string {
    const local = new ZonedDateTimeValue(this.epochMilliseconds, "UTC").toPlainDateTime()
    return `${local.toString()}Z`
  }

  toJSON(): string {
    return this.toString()
  }
}

class ZonedDateTimeValue {
  readonly epochMilliseconds: number
  readonly timeZoneId: string
  // Private so that equal values stay equal member by member.
  #local: PlainDateTimeValue | undefined

  constructor(epochMilliseconds: number, timeZoneId: string) {
    this.epochMilliseconds = epochMilliseconds
    this.timeZoneId = timeZoneId
  }

  static from(value: string | ZonedDateTimeValue): ZonedDateTimeValue {
    if (typeof value !== "string") return value
    const zone = ZONE_RE.exec(value)?.[1]
    if (!zone) throw new RangeError(`no time zone in: ${value}`)
    const offset = parseOffsetMs(value)
    if (offset !== null) {
      return new ZonedDateTimeValue(
        PlainDateTimeValue.from(value).localMs - offset,
        assertZone(zone),
      )
    }
    return PlainDateTimeValue.from(value).toZonedDateTime(zone)
  }

  static compare(a: string | ZonedDateTimeValue, b: string | ZonedDateTimeValue): number {
    return Math.sign(
      ZonedDateTimeValue.from(a).epochMilliseconds - ZonedDateTimeValue.from(b).epochMilliseconds,
    )
  }

  private get local(): PlainDateTimeValue {
    this.#local ??= PlainDateTimeValue.fromLocalMs(
      this.epochMilliseconds + this.offsetNanoseconds / 1e6,
    )
    return this.#local
  }

  get offsetNanoseconds(): number {
    return zoneOffsetMs(this.timeZoneId, this.epochMilliseconds) * 1e6
  }

  get offset(): string {
    return formatOffset(this.offsetNanoseconds / 1e6)
  }

  get year() {
    return this.local.year
  }
  get month() {
    return this.local.month
  }
  get day() {
    return this.local.day
  }
  get hour() {
    return this.local.hour
  }
  get minute() {
    return this.local.minute
  }
  get second() {
    return this.local.second
  }
  get millisecond() {
    return this.local.millisecond
  }
  get dayOfWeek() {
    return this.local.dayOfWeek
  }

  add(d: DurationLike): ZonedDateTimeValue {
    // Calendar units move the wallclock; time units move the instant.
    const dateOnly = { years: d.years, months: d.months, weeks: d.weeks, days: d.days }
    const moved = this.local.add(dateOnly).toZonedDateTime(this.timeZoneId)
    return new ZonedDateTimeValue(moved.epochMilliseconds + timeMs(d), this.timeZoneId)
  }

  subtract(d: DurationLike): ZonedDateTimeValue {
    return this.add(negated(d))
  }

  with(fields: Partial<DateTimeLike>): ZonedDateTimeValue {
    return this.local.with(fields).toZonedDateTime(this.timeZoneId)
  }

  withTimeZone(zone: string): ZonedDateTimeValue {
    return new ZonedDateTimeValue(this.epochMilliseconds, assertZone(zone))
  }

  until(other: string | ZonedDateTimeValue, options?: DifferenceOptions): DurationValue {
    const target = ZonedDateTimeValue.from(other)
    const largest = singular(options?.largestUnit ?? "hour")
    if (largest === "day") {
      // Days are wallclock days, so a DST change doesn't lose one.
      return this.local.until(target.withTimeZone(this.timeZoneId).toPlainDateTime(), {
        largestUnit: "day",
      })
    }
    return timeDuration(target.epochMilliseconds - this.epochMilliseconds, largest)
  }

  since(other: string | ZonedDateTimeValue, options?: DifferenceOptions): DurationValue {
    return ZonedDateTimeValue.from(other).until(this, options)
  }

  equals(other: string | ZonedDateTimeValue): boolean {
    const target = ZonedDateTimeValue.from(other)
    return (
      target.epochMilliseconds === this.epochMilliseconds && target.timeZoneId === this.timeZoneId
    )
  }

  toInstant(): InstantValue {
    return new InstantValue(this.epochMilliseconds)
  }

  toPlainDate(): PlainDateValue {
    return this.local.toPlainDate()
  }

  toPlainTime(): PlainTimeValue {
    return this.local.toPlainTime()
  }

  toPlainDateTime(): PlainDateTimeValue {
    return this.local
  }

  toString(): string {
    return `${this.local.toString()}${this.offset}[${this.timeZoneId}]`
  }

  toJSON(): string {
    return this.toString()
  }
}

const zonedNow = (zone?: string) =>
  new ZonedDateTimeValue(nowMs(), assertZone(zone ?? Backend.systemZone()))

export const Temporal = {
  Duration: DurationValue,
  Instant: InstantValue,
  PlainDate: PlainDateValue,
  PlainDateTime: PlainDateTimeValue,
  PlainTime: PlainTimeValue,
  ZonedDateTime: ZonedDateTimeValue,
  Now: {
    instant: () => new InstantValue(nowMs()),
    timeZoneId: () => Backend.systemZone(),
    zonedDateTimeISO: (zone?: string) => zonedNow(zone),
    plainDateISO: (zone?: string) => zonedNow(zone).toPlainDate(),
    plainDateTimeISO: (zone?: string) => zonedNow(zone).toPlainDateTime(),
  },
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Temporal {
  type Duration = DurationValue
  type Instant = InstantValue
  type PlainDate = PlainDateValue
  type PlainDateTime = PlainDateTimeValue
  type PlainTime = PlainTimeValue
  type ZonedDateTime = ZonedDateTimeValue
}
