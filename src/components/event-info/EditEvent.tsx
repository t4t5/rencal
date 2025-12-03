import { format, parse } from "date-fns"
import { and, eq } from "drizzle-orm"
import { useCallback, useEffect, useState } from "react"
import { RRule, RRuleSet, rrulestr } from "rrule"

import { EventInfo } from "@/components/event-info/EventInfo"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { db, schema } from "@/db/database"
import { CalendarEvent } from "@/db/types"

import { RecurrenceConfirmDialog } from "./RecurrenceConfirmDialog"

export const EditEvent = ({ event }: { event: CalendarEvent | null }) => {
  const { calendars } = useCalendarState()

  const [dirtyEvent, setDirtyEvent] = useState<CalendarEvent | null>(null)

  const [reminders, setReminders] = useState<number[]>([])

  const [parentRecurrence, setParentRecurrence] = useState<string | null>(null)
  const [pendingRecurrence, setPendingRecurrence] = useState<RRule | RRuleSet | null>(null)

  useEffect(() => {
    if (event) {
      setDirtyEvent(event)
      loadReminders(event.id)
      loadParentRecurrence(event.recurringEventId)
    }
  }, [event?.id])

  const loadReminders = async (eventId: string) => {
    const rows = await db
      .select()
      .from(schema.reminders)
      .where(eq(schema.reminders.eventId, eventId))

    setReminders(rows.map((r) => r.minutes))
  }

  const loadParentRecurrence = async (recurringEventId: string | null) => {
    if (recurringEventId) {
      const parent = await db
        .select({ recurrence: schema.events.recurrence })
        .from(schema.events)
        .where(eq(schema.events.id, recurringEventId))
        .get()

      setParentRecurrence(parent?.recurrence ?? null)
    } else {
      setParentRecurrence(null)
    }
  }

  const handleRecurrenceChange = (rrule: RRule | RRuleSet | null) => {
    if (!dirtyEvent) return

    // If this is an instance of a recurring event, show dialog
    if (dirtyEvent.recurringEventId) {
      setPendingRecurrence(rrule)
      return
    }
    // Otherwise, just update normally
    setDirtyEvent({ ...dirtyEvent, recurrence: rrule?.toString() ?? null })
  }

  const handleReminderAdd = useCallback(
    async (mins: number) => {
      if (!event) return

      // Skip duplicates:
      if (reminders.includes(mins)) return

      await db.insert(schema.reminders).values({
        eventId: event.id,
        minutes: mins,
      })

      setReminders([...reminders, mins])
    },
    [reminders.length],
  )

  const handleReminderRemove = async (mins: number) => {
    if (!event) return

    await db
      .delete(schema.reminders)
      .where(and(eq(schema.reminders.eventId, event.id), eq(schema.reminders.minutes, mins)))
    setReminders(reminders.filter((m) => m !== mins))
  }

  if (!dirtyEvent) return null

  const { summary, start, end, allDay, location, calendarId, recurrence } = dirtyEvent

  const effectiveRecurrence = recurrence ?? parentRecurrence
  const recurrenceRRule = effectiveRecurrence ? rrulestr(effectiveRecurrence) : null
  const calendar = calendars.find((c) => c.id === calendarId)

  return (
    <div className="px-2 py-5">
      <EventInfo
        summary={summary}
        start={start}
        end={end}
        allDay={allDay}
        location={location}
        calendar={calendar}
        onLocationChange={(newLocation) => {
          setDirtyEvent({ ...dirtyEvent, location: newLocation })
        }}
        onChangeSummary={(newSummary) => {
          setDirtyEvent({ ...dirtyEvent, summary: newSummary })
        }}
        onAllDayChange={(checked) => {
          setDirtyEvent({ ...dirtyEvent, allDay: checked })
        }}
        onChangeStartDate={(date) => {
          if (!date) return
          const newStart = parse(format(date, "yyyy-MM-dd"), "yyyy-MM-dd", start)
          setDirtyEvent({ ...dirtyEvent, start: newStart })
        }}
        onChangeStartTime={(time) => {
          const newStart = parse(time, "HH:mm", start)
          setDirtyEvent({ ...dirtyEvent, start: newStart })
        }}
        onChangeEndDate={(date) => {
          if (!date) return
          const newEnd = parse(format(date, "yyyy-MM-dd"), "yyyy-MM-dd", end)
          setDirtyEvent({ ...dirtyEvent, end: newEnd })
        }}
        onChangeEndTime={(time) => {
          const newEnd = parse(time, "HH:mm", end)
          setDirtyEvent({ ...dirtyEvent, end: newEnd })
        }}
        onCalendarChange={(newCalendarId) => {
          setDirtyEvent({ ...dirtyEvent, calendarId: newCalendarId })
        }}
        recurrence={recurrenceRRule}
        onRecurrenceChange={handleRecurrenceChange}
        reminders={reminders}
        onReminderAdd={handleReminderAdd}
        onReminderRemove={handleReminderRemove}
      />

      {!!pendingRecurrence && (
        <RecurrenceConfirmDialog
          pendingRecurrence={pendingRecurrence}
          onClose={() => setPendingRecurrence(null)}
          onApplyToAll={async () => {
            if (!dirtyEvent?.recurringEventId) return

            // Update parent event's recurrence
            await db
              .update(schema.events)
              .set({ recurrence: pendingRecurrence?.toString() ?? null })
              .where(eq(schema.events.id, dirtyEvent.recurringEventId))

            setParentRecurrence(pendingRecurrence?.toString() ?? null)
            setPendingRecurrence(null)
          }}
          onApplyToThis={async () => {
            if (!dirtyEvent) return

            // Detach from series and set own recurrence
            setDirtyEvent({
              ...dirtyEvent,
              recurringEventId: null,
              recurrence: pendingRecurrence?.toString() ?? null,
            })
            setParentRecurrence(null)
            setPendingRecurrence(null)
          }}
        />
      )}
    </div>
  )
}
