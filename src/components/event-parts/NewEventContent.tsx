import { type Ref, useCallback } from "react"
import { rrulestr } from "rrule"

import { EventInfo } from "@/components/event-parts/EventInfo"
import { Button } from "@/components/ui/button"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { DEFAULT_DURATION_MINS, useEventDraft } from "@/contexts/EventDraftContext"

import {
  addMinutes,
  isAllDay,
  normalizeAllDayRange,
  toAllDay,
  toTimedAtStartOfDay,
} from "@/lib/event-time"
import { rruleToRecurrence } from "@/lib/rrule-utils"

type NewEventContentProps = {
  summaryRef?: Ref<HTMLTextAreaElement>
  onCreated: () => void
}

export const NewEventContent = ({ summaryRef, onCreated }: NewEventContentProps) => {
  const { calendars } = useCalendars()
  const { draftEvent, setDraftEvent, draftReminders, setDraftReminders, createDraftEvent } =
    useEventDraft()

  const { summary, description, start, end, location, calendarId, recurrence } = draftEvent
  const allDay = isAllDay(start)

  const recurrenceRRule = recurrence ? rrulestr(recurrence.rrule) : null

  const onCreate = useCallback(async () => {
    await createDraftEvent()
    onCreated()
  }, [createDraftEvent, onCreated])

  const calendar = calendars.find((cal) => cal.slug === calendarId)

  return (
    <>
      <div className="p-2">
        <EventInfo
          summaryRef={summaryRef}
          summary={summary}
          onClose={onCreate}
          description={description}
          start={start}
          end={end}
          allDay={allDay}
          location={location}
          calendar={calendar}
          onDescriptionChange={(newDescription) => {
            setDraftEvent({ ...draftEvent, description: newDescription || null })
          }}
          onLocationChange={(newLocation) => {
            setDraftEvent({ ...draftEvent, location: newLocation || null })
          }}
          onChangeSummary={(newSummary) => {
            setDraftEvent({ ...draftEvent, summary: newSummary })
          }}
          onAllDayChange={(checked) => {
            if (checked) {
              const allDayStart = toAllDay(start)
              const { end: allDayEnd } = normalizeAllDayRange(allDayStart, toAllDay(end))
              setDraftEvent({ ...draftEvent, start: allDayStart, end: allDayEnd })
            } else {
              const timedStart = isAllDay(start) ? toTimedAtStartOfDay(start) : start
              setDraftEvent({
                ...draftEvent,
                start: timedStart,
                end: addMinutes(timedStart, DEFAULT_DURATION_MINS),
              })
            }
          }}
          onChangeDateTime={({ start: newStart, end: newEnd }) => {
            setDraftEvent({ ...draftEvent, start: newStart, end: newEnd })
          }}
          onCalendarChange={(newCalendarId) => {
            setDraftEvent({ ...draftEvent, calendarId: newCalendarId })
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
        <Button onClick={onCreate} className="w-full">
          Add Event
        </Button>
      </div>
    </>
  )
}
