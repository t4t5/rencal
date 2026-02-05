import { format, parse } from "date-fns"
import { and, eq } from "drizzle-orm"
import { useCallback, useEffect, useState } from "react"
import { RRule, RRuleSet } from "rrule"

import { EventInfo } from "@/components/event-info/EventInfo"
import { Button } from "@/components/ui/button"

import { rpc } from "@/rpc"
import { CalendarEvent } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"

import { useDebouncedEffect } from "@/hooks/useDebouncedEffect"
import { recurrenceToRRuleSet, rruleToRecurrence } from "@/lib/rrule-utils"

import { db, schema } from "@/db/database"

import { DeleteConfirmDialog } from "./DeleteConfirmDialog"
import { RecurrenceConfirmDialog } from "./RecurrenceConfirmDialog"

export const EditEvent = ({ event }: { event: CalendarEvent | null }) => {
  const { calendars } = useCalendarState()
  const { setActiveEventId, reloadEvents } = useCalEvents()

  const [dirtyEvent, setDirtyEvent] = useState<CalendarEvent | null>(null)

  const [reminders, setReminders] = useState<number[]>([])

  const [parentRecurrence, setParentRecurrence] = useState<string | null>(null)
  const [pendingRecurrence, setPendingRecurrence] = useState<RRule | RRuleSet | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  useEffect(() => {
    if (event) {
      setDirtyEvent(event)
      loadReminders(event.id)
      loadParentRecurrence(event.calendar_slug, event.recurring_event_id)
    }
  }, [event?.id])

  // Auto-save to caldir when dirtyEvent changes
  useDebouncedEffect(
    async () => {
      if (!dirtyEvent || !event) return
      // Skip if nothing actually changed
      if (JSON.stringify(dirtyEvent) === JSON.stringify(event)) return

      await rpc.caldir.update_event({
        id: dirtyEvent.id,
        calendar_slug: dirtyEvent.calendar_slug,
        summary: dirtyEvent.summary,
        description: dirtyEvent.description,
        location: dirtyEvent.location,
        start: dirtyEvent.start,
        end: dirtyEvent.end,
        all_day: dirtyEvent.all_day,
        recurrence: dirtyEvent.recurrence,
      })

      await reloadEvents()
    },
    [dirtyEvent],
    500,
  )

  const loadReminders = async (eventId: string) => {
    const rows = await db
      .select()
      .from(schema.reminders)
      .where(eq(schema.reminders.eventId, eventId))

    setReminders(rows.map((r) => r.minutes))
  }

  const loadParentRecurrence = async (calendarSlug: string, recurringEventId: string | null) => {
    if (recurringEventId) {
      const parent = await rpc.caldir.get_event(calendarSlug, recurringEventId)
      setParentRecurrence(parent?.recurrence?.rrule ?? null)
    } else {
      setParentRecurrence(null)
    }
  }

  const handleRecurrenceChange = (rrule: RRule | RRuleSet | null) => {
    if (!dirtyEvent) return

    // If this is an instance of a recurring event, show dialog
    if (dirtyEvent.recurring_event_id) {
      setPendingRecurrence(rrule)
      return
    }

    // Otherwise, just update normally
    const recurrence = rruleToRecurrence(rrule)
    setDirtyEvent({ ...dirtyEvent, recurrence })
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

  const handleDeleteThis = async () => {
    if (!dirtyEvent) return

    await rpc.caldir.delete_event(dirtyEvent.calendar_slug, dirtyEvent.id)

    setShowDeleteDialog(false)
    setActiveEventId(null)
    await reloadEvents()
  }

  const handleDeleteAll = async () => {
    if (!dirtyEvent) return

    // Get the parent event to find the shared UID
    const parentId = dirtyEvent.recurring_event_id ?? dirtyEvent.id

    if (parent) {
      await rpc.caldir.delete_recurring_series(dirtyEvent.calendar_slug, parentId)
    }

    setShowDeleteDialog(false)
    setActiveEventId(null)
    await reloadEvents()
  }

  if (!dirtyEvent) return null

  const { summary, start, end, all_day, location, calendar_slug, recurrence } = dirtyEvent

  const recurrenceRRule = recurrence ? recurrenceToRRuleSet(recurrence) : null
  const calendar = calendars.find((c) => c.slug === calendar_slug)

  return (
    <div className="px-2 pt-5 pb-2 flex flex-col grow">
      <EventInfo
        summary={summary}
        start={new Date(start)}
        end={new Date(end)}
        allDay={all_day}
        location={location}
        calendar={calendar}
        onLocationChange={(newLocation) => {
          setDirtyEvent({ ...dirtyEvent, location: newLocation })
        }}
        onChangeSummary={(newSummary) => {
          setDirtyEvent({ ...dirtyEvent, summary: newSummary })
        }}
        onAllDayChange={(checked) => {
          setDirtyEvent({ ...dirtyEvent, all_day: checked })
        }}
        onChangeStartDate={(date) => {
          if (!date) return
          const newStart = parse(format(date, "yyyy-MM-dd"), "yyyy-MM-dd", start)
          setDirtyEvent({ ...dirtyEvent, start: newStart.toISOString() })
        }}
        onChangeStartTime={(time) => {
          const newStart = parse(time, "HH:mm", start)
          setDirtyEvent({ ...dirtyEvent, start: newStart.toISOString() })
        }}
        onChangeEndDate={(date) => {
          if (!date) return
          const newEnd = parse(format(date, "yyyy-MM-dd"), "yyyy-MM-dd", end)
          setDirtyEvent({ ...dirtyEvent, end: newEnd.toISOString() })
        }}
        onChangeEndTime={(time) => {
          const newEnd = parse(time, "HH:mm", end)
          setDirtyEvent({ ...dirtyEvent, end: newEnd.toISOString() })
        }}
        onCalendarChange={(newCalendarId) => {
          setDirtyEvent({ ...dirtyEvent, calendar_slug: newCalendarId })
        }}
        recurrence={recurrenceRRule}
        onRecurrenceChange={handleRecurrenceChange}
        reminders={reminders}
        onReminderAdd={handleReminderAdd}
        onReminderRemove={handleReminderRemove}
      />

      <div className="p-2">
        <Button className="w-full" variant="destructive" onClick={() => setShowDeleteDialog(true)}>
          Delete event
        </Button>
      </div>

      <DeleteConfirmDialog
        open={showDeleteDialog}
        isRecurring={!!(dirtyEvent.recurring_event_id || dirtyEvent.recurrence)}
        onClose={() => setShowDeleteDialog(false)}
        onDeleteThis={handleDeleteThis}
        onDeleteAll={handleDeleteAll}
      />

      {!!pendingRecurrence && (
        <RecurrenceConfirmDialog
          pendingRecurrence={pendingRecurrence}
          onClose={() => setPendingRecurrence(null)}
          onApplyToAll={async () => {
            if (!dirtyEvent?.recurring_event_id) return

            // Update parent event's recurrence
            await db
              .update(schema.events)
              .set({ recurrence: pendingRecurrence?.toString() ?? null })
              .where(eq(schema.events.id, dirtyEvent.recurring_event_id))

            setParentRecurrence(pendingRecurrence?.toString() ?? null)
            setPendingRecurrence(null)
          }}
          onApplyToThis={async () => {
            if (!dirtyEvent) return

            // Detach from series and set own recurrence
            setDirtyEvent({
              ...dirtyEvent,
              recurring_event_id: null,
              recurrence: pendingRecurrence ? rruleToRecurrence(pendingRecurrence) : null,
            })
            setParentRecurrence(null)
            setPendingRecurrence(null)
          }}
        />
      )}
    </div>
  )
}
