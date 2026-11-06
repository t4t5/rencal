import type { Calendar, IcsImportResult, IcsPreview, IcsSourceCalendar } from "@/lib/api"
import {
  dateInEventZone,
  displayEndDate,
  type EventTime,
  formatLongDate,
  formatShortDate,
  formatTime,
  isAllDay,
  isSameDay,
  type TimeFormat,
} from "@/lib/event-time"

// A calendar slug, or one of these.
export const NEW_CALENDAR = "\0new"
export const SKIP = "\0skip"

export const fileName = (path: string) => path.split(/[/\\]/).pop() || path

export const eventsLabel = (count: number) =>
  count === 1 ? "1 event" : `${count.toLocaleString()} events`

export const totalEvents = (preview: IcsPreview) =>
  preview.calendars.reduce((sum, calendar) => sum + calendar.event_count, 0)

export function sourceSummary(source: IcsSourceCalendar): string {
  const first = formatShortDate(source.first_start)
  const last = formatShortDate(source.last_start)
  const range = first === last ? first : `${first} – ${last}`
  return `${eventsLabel(source.event_count)} · ${range}`
}

export function eventWhen(start: EventTime, end: EventTime, timeFormat: TimeFormat): string {
  if (isAllDay(start)) {
    const last = displayEndDate({ start, end })
    const first = formatLongDate(start)
    return last.equals(dateInEventZone(start)) ? first : `${first} – ${formatLongDate(last)}`
  }
  const startTime = formatTime(start, timeFormat)
  const endTime = formatTime(end, timeFormat)
  if (isSameDay(start, end)) return `${formatLongDate(start)} · ${startTime} – ${endTime}`
  return `${formatLongDate(start)} ${startTime} – ${formatLongDate(end)} ${endTime}`
}

export function importedMessage(result: IcsImportResult, calendars: Calendar[]): string {
  if (result.imported_count === 0) {
    return result.duplicate_count === 1
      ? "This event is already in your calendar"
      : "These events are already in your calendar"
  }
  if (result.event) {
    const calendar = calendars.find((cal) => cal.slug === result.event?.calendar_slug)
    const added = `Added “${result.event.summary || "Untitled event"}”`
    return calendar?.name ? `${added} to ${calendar.name}` : added
  }
  const skipped = result.duplicate_count
    ? ` (${eventsLabel(result.duplicate_count)} already there)`
    : ""
  return `Imported ${eventsLabel(result.imported_count)}${skipped}`
}
