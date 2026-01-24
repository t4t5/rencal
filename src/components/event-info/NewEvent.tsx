import { format, parse } from "date-fns"
import { useCallback } from "react"
import { rrulestr } from "rrule"

import { EventInfo } from "@/components/event-info/EventInfo"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

import { rpc } from "@/rpc"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"

import { logger } from "@/lib/logger"

export const NewEvent = () => {
  const { calendars } = useCalendarState()
  const { draftEvent, setDraftEvent, setIsDrafting, draftReminders, setDraftReminders } =
    useEventDraft()
  const { reloadEvents } = useCalEvents()

  const { summary, start, end, allDay, location, calendarSlug, recurrence, description } =
    draftEvent

  const recurrenceRRule = recurrence ? rrulestr(recurrence) : null

  const onCreate = useCallback(async () => {
    try {
      await rpc.caldir.create_event({
        calendarSlug,
        summary: summary || "Untitled Event",
        description,
        location,
        start: allDay ? format(start, "yyyy-MM-dd") : start.toISOString(),
        end: allDay ? format(end, "yyyy-MM-dd") : end.toISOString(),
        allDay,
      })

      logger.info("Created event via caldir:", draftEvent)
      setIsDrafting(false)
      await reloadEvents()
    } catch (error) {
      logger.error("Failed to create event:", error)
    }
  }, [draftEvent, draftReminders])

  const calendar = calendars.find((cal) => cal.slug === calendarSlug)

  return (
    <Card className="p-0 flex flex-col gap-0">
      <div className="p-2">
        <EventInfo
          summary={summary}
          start={start}
          end={end}
          allDay={allDay}
          location={location}
          calendar={calendar}
          onLocationChange={(newLocation) => {
            setDraftEvent({ ...draftEvent, location: newLocation })
          }}
          onChangeSummary={(newSummary) => {
            setDraftEvent({ ...draftEvent, summary: newSummary })
          }}
          onAllDayChange={(checked) => {
            setDraftEvent({ ...draftEvent, allDay: checked })
          }}
          onChangeStartDate={(date) => {
            if (!date) return
            const newStart = parse(format(date, "yyyy-MM-dd"), "yyyy-MM-dd", start)
            setDraftEvent({ ...draftEvent, start: newStart })
          }}
          onChangeStartTime={(time) => {
            const newStart = parse(time, "HH:mm", start)
            setDraftEvent({ ...draftEvent, start: newStart })
          }}
          onChangeEndDate={(date) => {
            if (!date) return
            const newEnd = parse(format(date, "yyyy-MM-dd"), "yyyy-MM-dd", end)
            setDraftEvent({ ...draftEvent, end: newEnd })
          }}
          onChangeEndTime={(time) => {
            const newEnd = parse(time, "HH:mm", end)
            setDraftEvent({ ...draftEvent, end: newEnd })
          }}
          onCalendarChange={(newCalendarSlug) => {
            setDraftEvent({ ...draftEvent, calendarSlug: newCalendarSlug })
          }}
          recurrence={recurrenceRRule}
          onRecurrenceChange={(rrule) => {
            setDraftEvent({ ...draftEvent, recurrence: rrule?.toString() ?? null })
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
    </Card>
  )
}
