import { parse } from "date-fns"
import { useEffect, useRef, useState } from "react"
import { HiEllipsisHorizontal } from "react-icons/hi2"
import { RRule, RRuleSet } from "rrule"

import { EventInfo } from "@/components/event-info/EventInfo"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { rpc } from "@/rpc"
import type { CalendarEvent, Recurrence, ResponseStatus } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"

import { isPendingEvent } from "@/lib/event-utils"
import { recurrenceToRRuleSet, rruleToRecurrence } from "@/lib/rrule-utils"

import { DeleteConfirmDialog } from "./DeleteConfirmDialog"
import { RecurrenceConfirmDialog } from "./RecurrenceConfirmDialog"

export const EditEvent = ({ event }: { event: CalendarEvent | null }) => {
  const { calendars } = useCalendarState()
  const { setActiveEventId, reloadEvents, setCalendarEvents } = useCalEvents()

  const [dirtyEvent, setDirtyEvent] = useState<CalendarEvent | null>(null)
  const originalEventRef = useRef<CalendarEvent | null>(null)

  const [pendingRecurrence, setPendingRecurrence] = useState<Recurrence | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  useEffect(() => {
    if (event) {
      setDirtyEvent(event)
      originalEventRef.current = event
    }
  }, [event?.id])

  const hasBeenEdited =
    !!dirtyEvent &&
    !!originalEventRef.current &&
    JSON.stringify(dirtyEvent) !== JSON.stringify(originalEventRef.current)

  // Keep dirtyEvent in a ref so the unmount cleanup always has the latest value
  const dirtyEventRef = useRef<CalendarEvent | null>(null)
  useEffect(() => {
    dirtyEventRef.current = dirtyEvent
  }, [dirtyEvent])

  // Save to caldir only when the popover/sheet closes (component unmounts)
  useEffect(() => {
    return () => {
      const current = dirtyEventRef.current
      const original = originalEventRef.current
      if (!current || !original) return
      if (JSON.stringify(current) === JSON.stringify(original)) return

      rpc.caldir.update_event({
        id: current.id,
        calendar_slug: current.calendar_slug,
        summary: current.summary,
        description: current.description,
        location: current.location,
        start: current.start,
        end: current.end,
        all_day: current.all_day,
        recurrence: current.recurrence,
        reminders: current.reminders,
      })

      setCalendarEvents((prev) => prev.map((e) => (e.id === current.id ? current : e)))
    }
  }, [])

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

  const { summary, description, start, end, all_day, location, calendar_slug, recurrence } =
    dirtyEvent

  const effectiveRecurrence = recurrence ?? dirtyEvent.master_recurrence
  const recurrenceRRule = effectiveRecurrence ? recurrenceToRRuleSet(effectiveRecurrence) : null
  const calendar = calendars.find((c) => c.slug === calendar_slug)

  const isPendingInvite = isPendingEvent(dirtyEvent, calendars)

  const handleRsvp = async (response: ResponseStatus) => {
    if (!dirtyEvent) return
    await rpc.caldir.rsvp(dirtyEvent.calendar_slug, dirtyEvent.id, response)
    setDirtyEvent({
      ...dirtyEvent,
      attendees: dirtyEvent.attendees.map((a) =>
        a.email.toLowerCase() === calendar?.account?.toLowerCase()
          ? { ...a, response_status: response }
          : a,
      ),
    })
    await reloadEvents()
  }

  return (
    <div className="px-2 pt-2 pb-2 flex flex-col grow">
      <div className="flex justify-end px-1 pb-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <HiEllipsisHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem variant="destructive" onClick={() => setShowDeleteDialog(true)}>
              Delete event
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <EventInfo
        summary={summary}
        onChangeSummary={(newSummary) => {
          setDirtyEvent({ ...dirtyEvent, summary: newSummary })
        }}
        description={description}
        onDescriptionChange={(newDescription) => {
          setDirtyEvent({ ...dirtyEvent, description: newDescription || null })
        }}
        start={new Date(start)}
        onChangeStartDate={(date) => {
          if (!date) return
          const oldStart = new Date(start)
          const newStart = new Date(start)
          newStart.setFullYear(date.getFullYear(), date.getMonth(), date.getDate())
          const delta = newStart.getTime() - oldStart.getTime()
          const newEnd = new Date(new Date(end).getTime() + delta)
          setDirtyEvent({
            ...dirtyEvent,
            start: newStart.toISOString(),
            end: newEnd.toISOString(),
          })
        }}
        onChangeStartTime={(time) => {
          const newStart = parse(time, "HH:mm", new Date(start))
          setDirtyEvent({ ...dirtyEvent, start: newStart.toISOString() })
        }}
        end={new Date(end)}
        onChangeEndDate={(date) => {
          if (!date) return
          const newEnd = new Date(end)
          newEnd.setFullYear(date.getFullYear(), date.getMonth(), date.getDate())
          setDirtyEvent({ ...dirtyEvent, end: newEnd.toISOString() })
        }}
        onChangeEndTime={(time) => {
          const newEnd = parse(time, "HH:mm", new Date(start))
          setDirtyEvent({ ...dirtyEvent, end: newEnd.toISOString() })
        }}
        allDay={all_day}
        onAllDayChange={(checked) => {
          setDirtyEvent({ ...dirtyEvent, all_day: checked })
        }}
        showTime={!all_day || hasBeenEdited}
        location={location}
        onLocationChange={(newLocation) => {
          setDirtyEvent({ ...dirtyEvent, location: newLocation || null })
        }}
        calendar={calendar}
        onCalendarChange={(newCalendarId) => {
          setDirtyEvent({ ...dirtyEvent, calendar_slug: newCalendarId })
        }}
        organizer={dirtyEvent.organizer}
        attendees={dirtyEvent.attendees}
        conferenceUrl={dirtyEvent.conference_url}
        recurrence={recurrenceRRule}
        onRecurrenceChange={handleRecurrenceChange}
        reminders={dirtyEvent.reminders}
        onReminderAdd={handleReminderAdd}
        onReminderRemove={handleReminderRemove}
        onRsvp={isPendingInvite ? handleRsvp : undefined}
        onClose={() => setActiveEventId(null)}
      />

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

            setDirtyEvent({ ...dirtyEvent, master_recurrence: pendingRecurrence ?? null })
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
              master_recurrence: null,
            })
            setPendingRecurrence(null)
          }}
        />
      )}
    </div>
  )
}
