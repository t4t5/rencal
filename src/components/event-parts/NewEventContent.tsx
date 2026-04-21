import { addMinutes } from "date-fns"
import { type Ref, useCallback } from "react"
import { rrulestr } from "rrule"

import { EventInfo } from "@/components/event-parts/EventInfo"
import { Button } from "@/components/ui/button"

import { useCalendars } from "@/contexts/CalendarStateContext"
import { DEFAULT_DURATION_MINS, useEventDraft } from "@/contexts/EventDraftContext"

import { rruleToRecurrence } from "@/lib/rrule-utils"
import { normalizeAllDayRange } from "@/lib/time"

type NewEventContentProps = {
  summaryRef?: Ref<HTMLTextAreaElement>
  onCreated: () => void
}

export const NewEventContent = ({ summaryRef, onCreated }: NewEventContentProps) => {
  const { calendars } = useCalendars()
  const { draftEvent, setDraftEvent, draftReminders, setDraftReminders, createDraftEvent } =
    useEventDraft()

  const { summary, description, start, end, allDay, location, calendarId, recurrence } = draftEvent

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
            const newEnd = checked
              ? normalizeAllDayRange(start, end).end
              : addMinutes(start, DEFAULT_DURATION_MINS)
            setDraftEvent({ ...draftEvent, allDay: checked, end: newEnd })
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
