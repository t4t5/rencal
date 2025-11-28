import { parse } from "date-fns"
import { useCallback } from "react"

import { EventInfo } from "@/components/event-info/EventInfo"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"

import { logger } from "@/lib/logger"

import { db, schema } from "@/db/database"

export const NewEvent = () => {
  const { draftEvent, setDraftEvent, setIsDrafting } = useEventDraft()
  const { reloadEvents } = useCalEvents()

  const { summary, start, end, allDay } = draftEvent

  // FIXME: this shouldn't be needed:
  const { calendars } = useCalendarState()
  const defaultCalendar = calendars[0]

  const onCreate = useCallback(async () => {
    await db.insert(schema.events).values({
      ...draftEvent,
      calendarId: defaultCalendar.id, // FIXME
    })

    logger.info("Create event:", draftEvent)
    setIsDrafting(false)
    reloadEvents()
  }, [draftEvent])

  return (
    <Card>
      <EventInfo
        summary={summary}
        start={start}
        end={end}
        allDay={allDay}
        onChangeSummary={(newSummary) => {
          setDraftEvent({ ...draftEvent, summary: newSummary })
        }}
        onAllDayChange={(checked) => {
          setDraftEvent({ ...draftEvent, allDay: checked })
        }}
        onChangeStartTime={(time) => {
          const newStart = parse(time, "HH:mm", start)
          setDraftEvent({ ...draftEvent, start: newStart })
        }}
        onChangeEndTime={(time) => {
          const newEnd = parse(time, "HH:mm", end)
          setDraftEvent({ ...draftEvent, end: newEnd })
        }}
      >
        <Button onClick={onCreate}>Add Event</Button>
      </EventInfo>
    </Card>
  )
}
