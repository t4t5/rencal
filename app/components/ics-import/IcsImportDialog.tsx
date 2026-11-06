import { resource, signal, Text, View } from "nsh"

import { ErrorText } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select } from "@/components/ui/select"

import {
  api,
  type Calendar,
  type CalendarEvent,
  getErrorMessage,
  type IcsImportResult,
  type IcsImportTarget,
  type IcsPreview,
  type IcsSourceCalendar,
} from "@/lib/api"
import { eventPaint } from "@/lib/event-paint"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"

import { calendars } from "@/stores/calendar"
import { defaultCalendar, timeFormat } from "@/stores/settings"

import {
  eventsLabel,
  eventWhen,
  fileName,
  importedMessage,
  NEW_CALENDAR,
  SKIP,
  sourceSummary,
  totalEvents,
} from "./ics-labels"

/** Asks where the events of an .ics file should go, then imports them. */
export function IcsImportDialog(props: {
  path: string
  onClose: () => void
  onImported: (result: IcsImportResult) => void
}) {
  const preview = resource(
    () => props.path,
    (path) => api.icsFiles.preview(path),
  )
  const importing = signal(false)
  const loadError = () => {
    const error = preview.error()
    return error ? getErrorMessage(error, "Couldn’t read this file") : null
  }

  return (
    <Dialog
      open
      class="w-[448px]"
      onOpenChange={(open) => {
        if (!open && !importing()) props.onClose()
      }}
    >
      <If
        when={preview()}
        else={
          <>
            <DialogHeader>
              <DialogTitle>Import .ics file</DialogTitle>
              <DialogDescription>{fileName(props.path)}</DialogDescription>
            </DialogHeader>
            <If
              when={loadError()}
              else={<Text class="text-sm text-muted-foreground">Reading file…</Text>}
            >
              <ErrorText message={loadError()} />
            </If>
          </>
        }
      >
        {(loaded) => (
          <IcsImportForm
            path={props.path}
            preview={loaded()}
            importing={importing()}
            setImporting={(value) => importing.set(value)}
            onClose={props.onClose}
            onImported={props.onImported}
          />
        )}
      </If>
    </Dialog>
  )
}

function IcsImportForm(props: {
  path: string
  preview: IcsPreview
  importing: boolean
  setImporting: (importing: boolean) => void
  onClose: () => void
  onImported: (result: IcsImportResult) => void
}) {
  const writable = () => calendars().filter((calendar) => !calendar.read_only)
  const single = () => props.preview.event

  // One event goes into a calendar you have; a whole export gets its own.
  const initialDestination = () => {
    const list = writable()
    if (!single() || list.length === 0) return NEW_CALENDAR
    return list.find((cal) => cal.slug === defaultCalendar())?.slug ?? list[0]!.slug
  }
  const destinations = signal<string[]>(props.preview.calendars.map(initialDestination))
  const error = signal<string | null>(null)

  const chosen = () =>
    props.preview.calendars.flatMap((source, index) => {
      const destination = destinations()[index]!
      return destination === SKIP ? [] : [{ source, index, destination }]
    })
  const eventCount = () => chosen().reduce((sum, { source }) => sum + source.event_count, 0)
  const dropsGuests = () =>
    chosen().some(
      ({ source, destination }) =>
        source.has_guests && !!writable().find((cal) => cal.slug === destination)?.provider,
    )

  async function runImport() {
    error.set(null)
    props.setImporting(true)
    try {
      const targets: IcsImportTarget[] = chosen().map(({ source, index, destination }) => ({
        source: index,
        destination:
          destination === NEW_CALENDAR
            ? { kind: "new", name: source.name, color: source.color }
            : { kind: "existing", calendar_slug: destination },
      }))
      const result = await api.icsFiles.import(props.path, targets)
      toast.success(importedMessage(result, calendars()))
      props.onClose()
      props.onImported(result)
    } catch (e) {
      error.set(getErrorMessage(e, "Couldn’t import this file"))
      props.setImporting(false)
    }
  }

  const title = () => {
    if (single()) return "Add event"
    return props.preview.calendars.length > 1 ? "Import calendars" : "Import calendar"
  }

  const importLabel = () => {
    if (props.importing) return "Importing…"
    return single() ? "Add event" : `Import ${eventsLabel(eventCount())}`
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title()}</DialogTitle>
        <DialogDescription>
          {single()
            ? props.preview.file_name
            : `${props.preview.file_name} · ${eventsLabel(totalEvents(props.preview))}`}
        </DialogDescription>
      </DialogHeader>

      <View class="min-w-0 gap-4">
        <If when={single()}>{(event) => <EventSummary event={event()} />}</If>

        <Each of={props.preview.calendars}>
          {(source, index) => (
            <View class="min-w-0 gap-1.5">
              <If when={!single()}>
                <View class="min-w-0 flex-row items-baseline justify-between gap-3">
                  <Text class="truncate text-sm font-medium">{source().name}</Text>
                  <Text class="shrink-0 text-sm text-muted-foreground">
                    {sourceSummary(source())}
                  </Text>
                </View>
              </If>
              <DestinationSelect
                source={source()}
                calendars={writable()}
                value={destinations()[index()]!}
                allowSkip={props.preview.calendars.length > 1}
                disabled={props.importing}
                onChange={(destination) =>
                  destinations.update((all) =>
                    all.map((value, i) => (i === index() ? destination : value)),
                  )
                }
              />
            </View>
          )}
        </Each>

        <If when={props.preview.skipped_count > 0}>
          <Text class="text-sm text-muted-foreground">
            {eventsLabel(props.preview.skipped_count)} in this file couldn’t be read and will be
            left out.
          </Text>
        </If>
        <If when={dropsGuests()}>
          <Text class="text-sm text-muted-foreground">
            Guests aren’t copied into synced calendars, so nobody gets an invitation email.
          </Text>
        </If>
        <ErrorText message={error()} />
      </View>

      <DialogFooter>
        <Button
          variant="secondary"
          label="Cancel"
          onPress={props.onClose}
          disabled={props.importing}
        />
        <Button
          label={importLabel()}
          onPress={() => void runImport()}
          disabled={props.importing || chosen().length === 0}
        />
      </DialogFooter>
    </>
  )
}

function EventSummary(props: { event: CalendarEvent }) {
  return (
    <View class="min-w-0 gap-0.5">
      <Text class="text-sm font-medium">{props.event.summary || "Untitled event"}</Text>
      <Text class="text-sm text-muted-foreground">
        {eventWhen(props.event.start, props.event.end, timeFormat())}
      </Text>
      <If when={props.event.location}>
        <Text class="text-sm text-muted-foreground">{props.event.location}</Text>
      </If>
    </View>
  )
}

function DestinationSelect(props: {
  source: IcsSourceCalendar
  calendars: Calendar[]
  value: string
  allowSkip: boolean
  disabled: boolean
  onChange: (destination: string) => void
}) {
  const newLabel = () => `New calendar “${props.source.name}”`
  const items = () => [
    { value: NEW_CALENDAR, title: newLabel() },
    ...props.calendars.map((cal) => ({ value: cal.slug, title: cal.name || cal.slug })),
    ...(props.allowSkip ? [{ value: SKIP, title: "Don’t import" }] : []),
  ]
  const colorOf = (value: string) => {
    if (value === SKIP) return null
    if (value === NEW_CALENDAR) return eventPaint(props.source.color).color
    return eventPaint(props.calendars.find((cal) => cal.slug === value)?.color ?? null).color
  }

  return (
    <Select
      variant="default"
      items={items()}
      value={props.value}
      disabled={props.disabled}
      leading={(item) => <Swatch color={colorOf(item.value)} />}
      label={
        <View class="min-w-0 flex-1 flex-row items-center gap-2">
          <Swatch color={colorOf(props.value)} />
          <Text class="truncate text-sm text-foreground">
            {items().find((item) => item.value === props.value)?.title ?? props.value}
          </Text>
        </View>
      }
      onChange={(value) => {
        if (value !== null) props.onChange(value)
      }}
    />
  )
}

function Swatch(props: { color: string | null }) {
  return (
    <View
      class={cn("size-3 shrink-0 rounded-(--radius-xs)", !props.color && "opacity-0")}
      style={props.color ? { backgroundColor: props.color } : undefined}
    />
  )
}
