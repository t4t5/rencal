import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ItemContent, ItemMedia } from "@/components/ui/item"
import { SelectMenuTrigger } from "@/components/ui/select"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import {
  api,
  getErrorMessage,
  type Calendar,
  type CalendarEvent,
  type IcsImportResult,
  type IcsImportTarget,
  type IcsPreview,
  type IcsSourceCalendar,
} from "@/lib/api"
import {
  DEFAULT_CALENDAR_COLOR,
  getCalendarColor,
  withThemeEventColor,
} from "@/lib/calendar-styles"
import {
  dateInEventZone,
  displayEndDate,
  formatLongDate,
  formatShortDate,
  formatTime,
  isAllDay,
  isSameDay,
  type EventTime,
  type TimeFormat,
} from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { CheckIcon } from "@/icons/check"

// A calendar slug, or one of these.
const NEW_CALENDAR = "\0new"
const SKIP = "\0skip"

/** Asks where the events of an .ics file should go, then imports them. */
export function IcsImportDialog({
  path,
  onClose,
  onImported,
}: {
  path: string
  onClose: () => void
  onImported: (result: IcsImportResult) => void
}) {
  const [preview, setPreview] = useState<IcsPreview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.icsFiles
      .preview(path)
      .then((next) => {
        if (!cancelled) setPreview(next)
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(getErrorMessage(error, "Couldn’t read this file"))
      })
    return () => {
      cancelled = true
    }
  }, [path])

  const [isImporting, setIsImporting] = useState(false)

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen && !isImporting) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        {preview ? (
          <IcsImportForm
            path={path}
            preview={preview}
            isImporting={isImporting}
            setIsImporting={setIsImporting}
            onClose={onClose}
            onImported={onImported}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Import .ics file</DialogTitle>
              <DialogDescription className="break-words">{fileName(path)}</DialogDescription>
            </DialogHeader>
            {loadError ? (
              <p role="alert" className="text-sm text-destructive break-words">
                {loadError}
              </p>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                Reading file…
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function IcsImportForm({
  path,
  preview,
  isImporting,
  setIsImporting,
  onClose,
  onImported,
}: {
  path: string
  preview: IcsPreview
  isImporting: boolean
  setIsImporting: (importing: boolean) => void
  onClose: () => void
  onImported: (result: IcsImportResult) => void
}) {
  const { calendars } = useCalendars()
  const { defaultCalendar } = useSettings()
  const writable = calendars.filter((calendar) => !calendar.read_only)
  const single = preview.event

  // One event goes into a calendar you have; a whole export gets its own.
  const [destinations, setDestinations] = useState<string[]>(() =>
    preview.calendars.map(() => {
      if (!single || !writable.length) return NEW_CALENDAR
      return writable.find((cal) => cal.slug === defaultCalendar)?.slug ?? writable[0].slug
    }),
  )
  const [error, setError] = useState<string | null>(null)

  const chosen = preview.calendars.flatMap((source, index) => {
    const destination = destinations[index]
    return destination === SKIP ? [] : [{ source, index, destination }]
  })
  const eventCount = chosen.reduce((sum, { source }) => sum + source.event_count, 0)
  const dropsGuests = chosen.some(
    ({ source, destination }) =>
      source.has_guests && !!writable.find((cal) => cal.slug === destination)?.provider,
  )

  async function handleImport() {
    setError(null)
    setIsImporting(true)
    try {
      const targets: IcsImportTarget[] = chosen.map(({ source, index, destination }) => ({
        source: index,
        destination:
          destination === NEW_CALENDAR
            ? { kind: "new", name: source.name, color: source.color }
            : { kind: "existing", calendar_slug: destination },
      }))
      const result = await api.icsFiles.import(path, targets)
      toast.success(importedMessage(result, calendars))
      onClose()
      onImported(result)
    } catch (err) {
      setError(getErrorMessage(err, "Couldn’t import this file"))
    } finally {
      setIsImporting(false)
    }
  }

  const setDestination = (index: number, destination: string) =>
    setDestinations((current) => current.map((value, i) => (i === index ? destination : value)))

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {single
            ? "Add event"
            : preview.calendars.length > 1
              ? "Import calendars"
              : "Import calendar"}
        </DialogTitle>
        <DialogDescription className="break-words">
          {single
            ? preview.file_name
            : `${preview.file_name} · ${eventsLabel(totalEvents(preview))}`}
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-w-0 flex-col gap-4 text-sm">
        {single && <EventSummary event={single} />}

        {preview.calendars.map((source, index) => (
          <div key={index} className="flex min-w-0 flex-col gap-1.5">
            {!single && (
              <div className="flex min-w-0 items-baseline justify-between gap-3">
                <span className="truncate font-medium">{source.name}</span>
                <span className="shrink-0 text-muted-foreground">{sourceSummary(source)}</span>
              </div>
            )}
            <DestinationSelect
              source={source}
              calendars={writable}
              value={destinations[index]}
              allowSkip={preview.calendars.length > 1}
              disabled={isImporting}
              onChange={(destination) => setDestination(index, destination)}
            />
          </div>
        ))}

        {preview.skipped_count > 0 && (
          <p className="text-muted-foreground">
            {eventsLabel(preview.skipped_count)} in this file couldn’t be read and will be left out.
          </p>
        )}
        {dropsGuests && (
          <p className="text-muted-foreground">
            Guests aren’t copied into synced calendars, so nobody gets an invitation email.
          </p>
        )}
        {error && (
          <p role="alert" className="text-destructive break-words">
            {error}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={isImporting}>
          Cancel
        </Button>
        <Button onClick={handleImport} disabled={isImporting || !chosen.length}>
          {isImporting ? "Importing…" : single ? "Add event" : `Import ${eventsLabel(eventCount)}`}
        </Button>
      </DialogFooter>
    </>
  )
}

function EventSummary({ event }: { event: CalendarEvent }) {
  const { timeFormat } = useSettings()

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="break-words font-medium">{event.summary || "Untitled event"}</span>
      <span className="text-muted-foreground">{eventWhen(event.start, event.end, timeFormat)}</span>
      {event.location && (
        <span className="break-words text-muted-foreground">{event.location}</span>
      )}
    </div>
  )
}

function DestinationSelect({
  source,
  calendars,
  value,
  allowSkip,
  disabled,
  onChange,
}: {
  source: IcsSourceCalendar
  calendars: Calendar[]
  value: string
  allowSkip: boolean
  disabled: boolean
  onChange: (destination: string) => void
}) {
  const newColor = withThemeEventColor(source.color ?? DEFAULT_CALENDAR_COLOR)
  const selected = calendars.find((cal) => cal.slug === value)
  const label =
    value === NEW_CALENDAR
      ? `New calendar “${source.name}”`
      : value === SKIP
        ? "Don’t import"
        : selected?.name || value

  const option = (destination: string, color: string | null, text: string) => (
    <DropdownMenuItem
      key={destination}
      onSelect={() => onChange(destination)}
      className="gap-(--control-content-gap)"
    >
      <ItemContent className="flex min-w-0 items-center gap-2">
        <Swatch color={color} />
        <span className="truncate">{text}</span>
      </ItemContent>
      <CheckIcon className={cn(value !== destination && "invisible")} />
    </DropdownMenuItem>
  )

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <SelectMenuTrigger controlLayout variant="default" className="w-full">
          <ItemMedia>
            <Swatch
              color={
                value === NEW_CALENDAR
                  ? newColor
                  : value === SKIP
                    ? null
                    : getCalendarColor(selected)
              }
            />
          </ItemMedia>
          <ItemContent className="truncate text-left text-foreground">{label}</ItemContent>
        </SelectMenuTrigger>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-(--radix-dropdown-menu-trigger-width)">
        {option(NEW_CALENDAR, newColor, `New calendar “${source.name}”`)}
        {calendars.length > 0 && <DropdownMenuSeparator />}
        {calendars.map((cal) => option(cal.slug, getCalendarColor(cal), cal.name || cal.slug))}
        {allowSkip && <DropdownMenuSeparator />}
        {allowSkip && option(SKIP, null, "Don’t import")}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Swatch({ color }: { color: string | null }) {
  return (
    <div
      className={cn("size-3 shrink-0 rounded-xs", !color && "invisible")}
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}

function fileName(path: string): string {
  return path.split(/[/\\]/).pop() || path
}

function eventsLabel(count: number): string {
  return count === 1 ? "1 event" : `${count.toLocaleString()} events`
}

function totalEvents(preview: IcsPreview): number {
  return preview.calendars.reduce((sum, calendar) => sum + calendar.event_count, 0)
}

function sourceSummary(source: IcsSourceCalendar): string {
  const first = formatShortDate(source.first_start)
  const last = formatShortDate(source.last_start)
  const range = first === last ? first : `${first} – ${last}`
  return `${eventsLabel(source.event_count)} · ${range}`
}

function eventWhen(start: EventTime, end: EventTime, timeFormat: TimeFormat): string {
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

function importedMessage(result: IcsImportResult, calendars: Calendar[]): string {
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
