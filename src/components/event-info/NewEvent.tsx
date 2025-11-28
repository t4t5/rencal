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
  const { calendars } = useCalendarState()
  const { draftEvent, setDraftEvent, setIsDrafting } = useEventDraft()
  const { reloadEvents } = useCalEvents()

  const { summary, start, end, allDay, location, calendarId } = draftEvent

  const onCreate = useCallback(async () => {
    await db.insert(schema.events).values({
      ...draftEvent,
    })

    logger.info("Create event:", draftEvent)
    setIsDrafting(false)
    reloadEvents()
  }, [draftEvent])

  const calendar = calendars.find((cal) => cal.id === calendarId)

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
          onChangeStartTime={(time) => {
            const newStart = parse(time, "HH:mm", start)
            setDraftEvent({ ...draftEvent, start: newStart })
          }}
          onChangeEndTime={(time) => {
            const newEnd = parse(time, "HH:mm", end)
            setDraftEvent({ ...draftEvent, end: newEnd })
          }}
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
