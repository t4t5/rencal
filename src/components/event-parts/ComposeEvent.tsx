import { type Ref, useCallback } from "react"
import { rrulestr } from "rrule"

import { EventInfo } from "@/components/event-parts/EventInfo"
import { Button } from "@/components/ui/button"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"

import { useLastTimedRange } from "@/hooks/useLastTimedRange"
import { conferenceForCalendar } from "@/lib/conference"
import {
  addMinutes,
  DEFAULT_DURATION_MINS,
  type EventTime,
  isAllDay,
  normalizeAllDayRange,
  toAllDay,
  toTimedAtStartOfDay,
} from "@/lib/event-time"
import { rruleToRecurrence } from "@/lib/rrule-utils"

export const ComposeEventInner = ({
  summaryRef,
  onCreated,
  onBeforeCreate,
  onTabOut,
}: {
  summaryRef?: Ref<HTMLTextAreaElement>
  onCreated: () => void
  onBeforeCreate?: (start: EventTime) => void
  onTabOut?: () => void
}) => {
  const { calendars } = useCalendars()
  const {
    draftEvent,
    setDraftEvent,
    draftReminders,
    setDraftReminders,
    createDraftEvent,
    draftPopoverOpen,
  } = useEventDraft()

  const { summary, description, start, end, location, calendarId, recurrence } = draftEvent
  const allDay = isAllDay(start)
  const lastTimedRange = useLastTimedRange(start, end, draftPopoverOpen)

  const recurrenceRRule = recurrence ? rrulestr(recurrence.rrule) : null

  const onCreate = useCallback(async () => {
    onBeforeCreate?.(draftEvent.start)
    await createDraftEvent()
    onCreated()
  }, [createDraftEvent, onCreated, onBeforeCreate, draftEvent.start])

  const calendar = calendars.find((cal) => cal.slug === calendarId)

  return (
    <>
      <div className="p-2">
        <EventInfo
          onClose={onCreate}
          summaryRef={summaryRef}
          summary={summary}
          onChangeSummary={(newSummary) => {
            setDraftEvent({ ...draftEvent, summary: newSummary })
          }}
          description={description}
          onDescriptionChange={(newDescription) => {
            setDraftEvent({ ...draftEvent, description: newDescription || null })
          }}
          start={start}
          end={end}
          onChangeDateTime={({ start: newStart, end: newEnd }) => {
            setDraftEvent({ ...draftEvent, start: newStart, end: newEnd })
          }}
          allDay={allDay}
          onAllDayChange={(checked) => {
            if (checked) {
              const allDayStart = toAllDay(start)
              const { end: allDayEnd } = normalizeAllDayRange(allDayStart, toAllDay(end))
              setDraftEvent({ ...draftEvent, start: allDayStart, end: allDayEnd })
            } else {
              const timedStart = isAllDay(start) ? toTimedAtStartOfDay(start) : start
              setDraftEvent({
                ...draftEvent,
                start: lastTimedRange?.start ?? timedStart,
                end: lastTimedRange?.end ?? addMinutes(timedStart, DEFAULT_DURATION_MINS),
              })
            }
          }}
          location={location}
          onLocationChange={(newLocation) => {
            setDraftEvent({ ...draftEvent, location: newLocation || null })
          }}
          conference={draftEvent.conference}
          onConferenceChange={(conference) => {
            setDraftEvent({ ...draftEvent, conference })
          }}
          calendar={calendar}
          onCalendarChange={(newCalendarId) => {
            const newCalendar = calendars.find((cal) => cal.slug === newCalendarId)
            setDraftEvent({
              ...draftEvent,
              calendarId: newCalendarId,
              conference: conferenceForCalendar(draftEvent.conference, newCalendar),
            })
          }}
          attendees={draftEvent.attendees}
          onAttendeesChange={(newAttendees) => {
            setDraftEvent({ ...draftEvent, attendees: newAttendees })
          }}
          recurrence={recurrenceRRule}
          onRecurrenceChange={(rrule) => {
            setDraftEvent({ ...draftEvent, recurrence: rruleToRecurrence(rrule) })
          }}
          reminders={draftReminders}
          onReminderAdd={(mins) => setDraftReminders([...draftReminders, mins])}
          onReminderRemove={(mins) => setDraftReminders(draftReminders.filter((m) => m !== mins))}
        />
      </div>

      <div className="p-4 pt-0">
        <Button
          onClick={onCreate}
          onKeyDown={(e) => {
            if (e.key !== "Tab" || e.shiftKey || !onTabOut) return
            e.preventDefault()
            onTabOut()
          }}
          className="w-full"
        >
          Add Event
        </Button>
      </div>
    </>
  )
}
