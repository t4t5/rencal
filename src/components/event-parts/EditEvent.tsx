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
import type { ResponseStatus } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useSync } from "@/contexts/SyncContext"

import { useDeleteEvent } from "@/hooks/useDeleteEvent"
import { withDates, type CalendarEvent } from "@/lib/cal-events"
import {
  addMinutes,
  DEFAULT_DURATION_MINS,
  isAllDay,
  normalizeAllDayRange,
  toAllDay,
  toTimedAtStartOfDay,
} from "@/lib/event-time"
import { getUserResponseStatus, isEventReadonly } from "@/lib/event-utils"
import { recurrenceToRRuleSet, rruleToRecurrence } from "@/lib/rrule-utils"

import { MoreHorizIcon } from "@/icons/more-horiz"

export const EditEvent = ({
  event,
  onRequestSave,
  children,
}: {
  event: CalendarEvent | null
  /**
   * Called once when the popover closes (component unmounts) if the event
   * has been edited. The parent decides whether to save directly or first
   * route through the recurrence-scope dialog.
   */
  onRequestSave: (current: CalendarEvent, original: CalendarEvent) => void
  children?: ReactNode
}) => {
  const { calendars } = useCalendars()
  const { setActiveEventId } = useCalEvents()
  const { requestSync } = useSync()

  const [dirtyEvent, setDirtyEvent] = useState<CalendarEvent | null>(null)
  const originalEventRef = useRef<CalendarEvent | null>(null)

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

  // Keep refs so the unmount cleanup always has the latest values
  const dirtyEventRef = useRef<CalendarEvent | null>(null)
  const onRequestSaveRef = useRef(onRequestSave)

  useEffect(() => {
    dirtyEventRef.current = dirtyEvent
  }, [dirtyEvent])

  useEffect(() => {
    onRequestSaveRef.current = onRequestSave
  })

  // Save to caldir only when the popover/sheet closes (component unmounts).
  // The parent decides whether to flush to disk directly or first route the
  // edit through the recurrence-scope dialog.
  useEffect(() => {
    return () => {
      const current = dirtyEventRef.current
      const original = originalEventRef.current
      if (!current || !original) return
      if (JSON.stringify(current) === JSON.stringify(original)) return

      onRequestSaveRef.current(current, original)
    }
  }, [])

  const handleRecurrenceChange = (rrule: RRule | RRuleSet | null) => {
    if (!dirtyEvent) return
    setDirtyEvent({ ...dirtyEvent, recurrence: rruleToRecurrence(rrule) })
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

  const { summary, description, start, end, location, calendar_slug, recurrence } = dirtyEvent
  const all_day = isAllDay(start)

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
    void requestSync()
  }

  return (
    <div className="px-2 pt-2 pb-2 flex flex-col grow">
      <div className="flex justify-end px-1 pb-1">
        {children}

        {!isReadonly && <OverflowMenu onDelete={() => triggerDelete(dirtyEvent)} />}
      </div>

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
        start={start}
        end={end}
        onChangeDateTime={({ start: newStart, end: newEnd }) => {
          setDirtyEvent(withDates(dirtyEvent, newStart, newEnd))
        }}
        allDay={all_day}
        onAllDayChange={(checked) => {
          if (checked) {
            const allDayStart = toAllDay(start)
            const { end: allDayEnd } = normalizeAllDayRange(allDayStart, toAllDay(end))
            setDirtyEvent(withDates(dirtyEvent, allDayStart, allDayEnd))
          } else {
            const timedStart = isAllDay(start) ? toTimedAtStartOfDay(start) : start
            setDirtyEvent(
              withDates(dirtyEvent, timedStart, addMinutes(timedStart, DEFAULT_DURATION_MINS)),
            )
          }
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
    </div>
  )
}

const OverflowMenu = ({ onDelete }: { onDelete: () => void }) => {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <MoreHorizIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          Delete event
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
