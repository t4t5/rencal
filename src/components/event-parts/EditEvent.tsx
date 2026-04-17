import { parse } from "date-fns"
import { ReactNode, useEffect, useRef, useState } from "react"
import { RRule, RRuleSet } from "rrule"

import { DeleteConfirmDialog } from "@/components/event-parts/DeleteConfirmDialog"
import { EventInfo } from "@/components/event-parts/EventInfo"
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
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSync } from "@/contexts/SyncContext"

import { useDeleteEvent } from "@/hooks/useDeleteEvent"
import { getUserResponseStatus, isEventReadonly } from "@/lib/event-utils"
import { recurrenceToRRuleSet, rruleToRecurrence } from "@/lib/rrule-utils"
import { formatEventTime, normalizeAllDayRange } from "@/lib/time"

import { MoreHorizIcon } from "@/icons/more-horiz"

import { RecurrenceConfirmDialog } from "./RecurrenceConfirmDialog"

export const EditEvent = ({
  event,
  children,
}: {
  event: CalendarEvent | null
  children?: ReactNode
}) => {
  const { calendars } = useCalendars()
  const { setActiveEventId, reloadEvents, setCalendarEvents } = useCalEvents()
  const { sync } = useSync()

  const [dirtyEvent, setDirtyEvent] = useState<CalendarEvent | null>(null)
  const originalEventRef = useRef<CalendarEvent | null>(null)

  const [pendingRecurrence, setPendingRecurrence] = useState<Recurrence | null>(null)
  const { triggerDelete, deleteDialogProps } = useDeleteEvent()

  useEffect(() => {
    if (event) {
      setDirtyEvent(event)
      originalEventRef.current = event
    }
  }, [event?.id])

  // Delete key shortcut: open delete dialog when no field is focused
  useEffect(() => {
    if (!dirtyEvent) return
    if (isEventReadonly(dirtyEvent, calendars)) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return
      if (deleteDialogProps.open) return

      const active = document.activeElement
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return
      }

      e.preventDefault()
      triggerDelete(dirtyEvent)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [dirtyEvent, calendars, deleteDialogProps.open, triggerDelete])

  const updateAndSyncEvent = async (current: CalendarEvent, original: CalendarEvent) => {
    // Optimistically update the UI before the RPC call
    setCalendarEvents((prev) => prev.map((e) => (e.id === current.id ? current : e)))

    await rpc.caldir.update_event({
      id: current.id,
      calendar_slug: original.calendar_slug,
      new_calendar_slug:
        current.calendar_slug !== original.calendar_slug ? current.calendar_slug : null,
      summary: current.summary,
      description: current.description,
      location: current.location,
      start: current.start,
      end: current.end,
      all_day: current.all_day,
      recurrence: current.recurrence,
      reminders: current.reminders,
    })
    await sync()
  }

  // Keep refs so the unmount cleanup always has the latest values
  const dirtyEventRef = useRef<CalendarEvent | null>(null)
  const updateAndSyncEventRef = useRef(updateAndSyncEvent)

  useEffect(() => {
    dirtyEventRef.current = dirtyEvent
  }, [dirtyEvent])

  useEffect(() => {
    updateAndSyncEventRef.current = updateAndSyncEvent
  })

  // Save to caldir only when the popover/sheet closes (component unmounts)
  useEffect(() => {
    return () => {
      const current = dirtyEventRef.current
      const original = originalEventRef.current
      if (!current || !original) return
      if (JSON.stringify(current) === JSON.stringify(original)) return

      void updateAndSyncEventRef.current(current, original)
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

  if (!dirtyEvent) return null

  const { summary, description, start, end, all_day, location, calendar_slug, recurrence } =
    dirtyEvent

  const effectiveRecurrence = recurrence ?? dirtyEvent.master_recurrence
  const recurrenceRRule = effectiveRecurrence ? recurrenceToRRuleSet(effectiveRecurrence) : null
  const calendar = calendars.find((c) => c.slug === calendar_slug)

  const userResponseStatus = getUserResponseStatus(dirtyEvent, calendars)
  const isAttendee = userResponseStatus !== null
  const isPendingInvite = userResponseStatus === "needs-action"
  const isReadonly = isEventReadonly(dirtyEvent, calendars)

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
    void sync()
  }

  return (
    <div className="px-2 pt-2 pb-2 flex flex-col grow">
      {!isReadonly && (
        <div className="flex justify-end px-1 pb-1">
          {children}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem variant="destructive" onClick={() => triggerDelete(dirtyEvent)}>
                Delete event
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <EventInfo
        readonly={isReadonly}
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
            start: formatEventTime(newStart, all_day),
            end: formatEventTime(newEnd, all_day),
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
          setDirtyEvent({ ...dirtyEvent, end: formatEventTime(newEnd, all_day) })
        }}
        onChangeEndTime={(time) => {
          const newEnd = parse(time, "HH:mm", new Date(start))
          setDirtyEvent({ ...dirtyEvent, end: newEnd.toISOString() })
        }}
        allDay={all_day}
        onAllDayChange={(checked) => {
          const range = checked
            ? normalizeAllDayRange(new Date(start), new Date(end))
            : { start: new Date(start), end: new Date(end) }
          setDirtyEvent({
            ...dirtyEvent,
            all_day: checked,
            end: formatEventTime(range.end, checked),
          })
        }}
        showTime={!all_day}
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
        onRsvp={isAttendee ? handleRsvp : undefined}
        userResponseStatus={userResponseStatus}
        isPendingInvite={isPendingInvite}
        onClose={() => setActiveEventId(null)}
      />

      <DeleteConfirmDialog {...deleteDialogProps} />

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
              new_calendar_slug: null,
              recurrence: pendingRecurrence,
            })

            setDirtyEvent({ ...dirtyEvent, master_recurrence: pendingRecurrence ?? null })
            setPendingRecurrence(null)
            await reloadEvents()
            void sync()
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
