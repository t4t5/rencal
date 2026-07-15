import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useState } from "react"
import { rrulestr } from "rrule"

import { EventInfo } from "@/components/event-parts/EventInfo"
import { Button } from "@/components/ui/button"
import { DragRegion } from "@/components/ui/drag-region"

import { rpc } from "@/rpc"
import type { ImportEventEdit } from "@/rpc/bindings"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSettings } from "@/contexts/SettingsContext"

import { useTheme } from "@/hooks/useTheme"
import {
  type CalendarEvent,
  recurrenceToRpc,
  rpcToCalendarEvent,
  withDates,
} from "@/lib/cal-events"
import {
  addMinutes,
  DEFAULT_DURATION_MINS,
  isAllDay,
  normalizeAllDayRange,
  toAllDay,
  toTimedAtStartOfDay,
} from "@/lib/event-time"
import { toRpcEventTime } from "@/lib/event-time/rpc"
import { rruleToRecurrence } from "@/lib/rrule-utils"
import { cn, isMacOS } from "@/lib/utils"

import { ChevronLeftIcon } from "@/icons/chevron-left"
import { ChevronRightIcon } from "@/icons/chevron-right"

function closeWindow() {
  getCurrentWindow()
    .close()
    .catch(() => {})
}

export function IcsPreviewWindow({ filePath }: { filePath: string }) {
  const { calendars } = useCalendars()
  const { defaultCalendar, defaultReminders } = useSettings()
  useTheme()

  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [overrideCount, setOverrideCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [calendarId, setCalendarId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    rpc.caldir
      .preview_ics(filePath)
      .then((preview) => {
        setOverrideCount(preview.override_count)
        setSkippedCount(preview.skipped_count)
        setEvents(
          preview.events.map((rpcEvent) => {
            const event = rpcToCalendarEvent(rpcEvent)
            return event.reminders.length ? event : { ...event, reminders: defaultReminders }
          }),
        )
      })
      .catch((err) => setError(String(err)))
  }, [defaultReminders, filePath])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTimeout(() => {
          if (!e.defaultPrevented) closeWindow()
        }, 0)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  const editableCalendars = calendars.filter((cal) => !cal.read_only)
  const targetCalendarId =
    calendarId ??
    (defaultCalendar && editableCalendars.some((c) => c.slug === defaultCalendar)
      ? defaultCalendar
      : editableCalendars[0]?.slug) ??
    null
  const targetCalendar = editableCalendars.find((cal) => cal.slug === targetCalendarId)

  const event = events?.[activeIndex]
  const lockSeriesShape = overrideCount > 0 && !!event?.recurrence

  const updateEvent = (updated: CalendarEvent) => {
    setEvents((prev) => prev?.map((e, i) => (i === activeIndex ? updated : e)) ?? prev)
  }

  const onAdd = async () => {
    if (!events || !targetCalendarId) return
    setIsAdding(true)
    setError(null)
    try {
      const edits: ImportEventEdit[] = events.map((e) => ({
        id: e.id,
        summary: e.summary,
        description: e.description,
        location: e.location,
        start: toRpcEventTime(e.start),
        end: toRpcEventTime(e.end),
        recurrence: e.recurrence ? recurrenceToRpc(e.recurrence) : null,
        reminders: e.reminders,
        attendees: e.attendees,
      }))
      await rpc.caldir.import_ics(filePath, targetCalendarId, edits)
      closeWindow()
    } catch (err) {
      setError(String(err))
      setIsAdding(false)
    }
  }

  if (error && !events) {
    return (
      <Shell>
        <div className="flex grow flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={closeWindow}>
            Close
          </Button>
        </div>
      </Shell>
    )
  }

  if (!event) return <Shell />

  return (
    <Shell>
      {events && events.length > 1 && (
        <div className="flex items-center justify-center gap-2 px-4 text-sm text-muted-foreground">
          <button
            onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
            disabled={activeIndex === 0}
            className="p-1 disabled:opacity-30"
            aria-label="Previous event"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <span>
            Event {activeIndex + 1} of {events.length}
          </span>
          <button
            onClick={() => setActiveIndex((i) => Math.min(events.length - 1, i + 1))}
            disabled={activeIndex === events.length - 1}
            className="p-1 disabled:opacity-30"
            aria-label="Next event"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      )}

      {(overrideCount > 0 || skippedCount > 0) && (
        <div className="flex flex-col gap-1 px-4 text-sm text-muted-foreground">
          {overrideCount > 0 && (
            <p>
              Includes {overrideCount} modified {overrideCount === 1 ? "occurrence" : "occurrences"}
              .
            </p>
          )}
          {skippedCount > 0 && (
            <p>
              Skipped {skippedCount} unparseable {skippedCount === 1 ? "event" : "events"}.
            </p>
          )}
        </div>
      )}

      <div className="grow overflow-y-auto p-2">
        <EventInfo
          summary={event.summary}
          onChangeSummary={(summary) => updateEvent({ ...event, summary })}
          onClose={onAdd}
          start={event.start}
          end={event.end}
          onChangeDateTime={({ start, end }) => updateEvent(withDates(event, start, end))}
          dateTimeReadOnly={lockSeriesShape}
          recurrenceReadOnly={lockSeriesShape}
          allDay={isAllDay(event.start)}
          onAllDayChange={(checked) => {
            if (checked) {
              const allDayStart = toAllDay(event.start)
              const { end: allDayEnd } = normalizeAllDayRange(allDayStart, toAllDay(event.end))
              updateEvent(withDates(event, allDayStart, allDayEnd))
            } else {
              const timedStart = toTimedAtStartOfDay(event.start)
              updateEvent(
                withDates(event, timedStart, addMinutes(timedStart, DEFAULT_DURATION_MINS)),
              )
            }
          }}
          location={event.location}
          onLocationChange={(location) => updateEvent({ ...event, location: location || null })}
          calendar={targetCalendar}
          onCalendarChange={setCalendarId}
          recurrence={event.recurrence ? rrulestr(event.recurrence.rrule) : null}
          onRecurrenceChange={(rrule) =>
            updateEvent({ ...event, recurrence: rruleToRecurrence(rrule) })
          }
          description={event.description}
          onDescriptionChange={(description) =>
            updateEvent({ ...event, description: description || null })
          }
          organizer={event.organizer}
          attendees={event.attendees}
          onAttendeesChange={(attendees) => updateEvent({ ...event, attendees })}
          conferenceUrl={event.conference_url}
          reminders={event.reminders}
          onReminderAdd={(mins) => updateEvent({ ...event, reminders: [...event.reminders, mins] })}
          onReminderRemove={(mins) =>
            updateEvent({ ...event, reminders: event.reminders.filter((m) => m !== mins) })
          }
        />
      </div>

      <div className="flex flex-col gap-2 p-4 pt-0">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={onAdd} disabled={isAdding || !targetCalendarId} className="w-full">
          {events && events.length > 1 ? `Add ${events.length} Events` : "Add to Calendar"}
        </Button>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <div className={cn("flex h-screen flex-col", { "pt-8": isMacOS })}>
      <DragRegion className="h-5! shrink-0" />
      {children}
    </div>
  )
}
