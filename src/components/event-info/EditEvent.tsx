import { format, parse } from "date-fns"
import { useEffect, useState } from "react"
import { RRule, RRuleSet } from "rrule"

import { EventInfo } from "@/components/event-info/EventInfo"
import { Button } from "@/components/ui/button"

import { rpc } from "@/rpc"
import { CalendarEvent, Recurrence } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"

import { useDebouncedEffect } from "@/hooks/useDebouncedEffect"
import { recurrenceToRRuleSet, rruleToRecurrence } from "@/lib/rrule-utils"

import { DeleteConfirmDialog } from "./DeleteConfirmDialog"
import { RecurrenceConfirmDialog } from "./RecurrenceConfirmDialog"

export const EditEvent = ({ event }: { event: CalendarEvent | null }) => {
  const { calendars } = useCalendarState()
  const { setActiveEventId, reloadEvents } = useCalEvents()

  const [dirtyEvent, setDirtyEvent] = useState<CalendarEvent | null>(null)

  const [parentRecurrence, setParentRecurrence] = useState<Recurrence | null>(null)
  const [pendingRecurrence, setPendingRecurrence] = useState<Recurrence | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  useEffect(() => {
    if (event) {
      setDirtyEvent(event)
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
        reminders: dirtyEvent.reminders,
      })

      await reloadEvents()
    },
    [dirtyEvent],
    500,
  )

  const loadParentRecurrence = async (calendarSlug: string, recurringEventId: string | null) => {
    if (recurringEventId) {
      const parent = await rpc.caldir.get_event(calendarSlug, recurringEventId)
      setParentRecurrence(parent?.recurrence ?? null)
    } else {
      setParentRecurrence(null)
    }
  }

  const handleRecurrenceChange = (rrule: RRule | RRuleSet | null) => {
    if (!dirtyEvent) return

    const recurrence = rruleToRecurrence(rrule)

    // If this is an instance of a recurring event, show dialog
    if (dirtyEvent.recurring_event_id) {
      setPendingRecurrence(recurrence)
      return
    }

    // Otherwise, just update normally
    setDirtyEvent({ ...dirtyEvent, recurrence })
  }

  const handleReminderAdd = (mins: number) => {
    if (!dirtyEvent) return
    if (dirtyEvent.reminders.includes(mins)) return

    setDirtyEvent({ ...dirtyEvent, reminders: [...dirtyEvent.reminders, mins] })
  }

  const handleReminderRemove = (mins: number) => {
    if (!dirtyEvent) return

    setDirtyEvent({ ...dirtyEvent, reminders: dirtyEvent.reminders.filter((m) => m !== mins) })
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

  const effectiveRecurrence = recurrence ?? parentRecurrence
  const recurrenceRRule = effectiveRecurrence ? recurrenceToRRuleSet(effectiveRecurrence) : null
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
        reminders={dirtyEvent.reminders}
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
          isOpen={!!pendingRecurrence}
          onClose={() => setPendingRecurrence(null)}
          onApplyToAll={async () => {
            if (!dirtyEvent?.recurring_event_id) return

            // Fetch parent event and update its recurrence
            const parent = await rpc.caldir.get_event(
              dirtyEvent.calendar_slug,
              dirtyEvent.recurring_event_id,
            )
            if (!parent) return

            await rpc.caldir.update_event({
              ...parent,
              recurrence: pendingRecurrence,
            })

            setParentRecurrence(pendingRecurrence ?? null)
            setPendingRecurrence(null)
            await reloadEvents()
          }}
          onApplyToThis={async () => {
            if (!dirtyEvent) return

            // Detach from series and set own recurrence
            setDirtyEvent({
              ...dirtyEvent,
              recurring_event_id: null,
              recurrence: pendingRecurrence ?? null,
            })
            setParentRecurrence(null)
            setPendingRecurrence(null)
          }}
        />
      )}
    </div>
  )
}
