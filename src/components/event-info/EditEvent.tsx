import { parse } from "date-fns"
import { useEffect, useState } from "react"

import { EventInfo } from "@/components/event-info/EventInfo"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { CalendarEvent } from "@/db/types"

export const EditEvent = ({ event }: { event: CalendarEvent | null }) => {
  const { calendars } = useCalendarState()

  const [dirtyEvent, setDirtyEvent] = useState<CalendarEvent | null>(null)

  useEffect(() => {
    if (event) {
      setDirtyEvent(event)
    }
  }, [event?.id])

  if (!dirtyEvent) return null

  const { summary, start, end, allDay, location, calendarId } = dirtyEvent

  const calendar = calendars.find((c) => c.id === calendarId)

  return (
    <div className="px-2 py-5">
      <EventInfo
        summary={summary}
        start={start}
        end={end}
        allDay={allDay}
        location={location}
        calendar={calendar}
        onLocationChange={(newLocation) => {
          setDirtyEvent({ ...dirtyEvent, location: newLocation })
        }}
        onChangeSummary={(newSummary) => {
          setDirtyEvent({ ...dirtyEvent, summary: newSummary })
        }}
        onAllDayChange={(checked) => {
          setDirtyEvent({ ...dirtyEvent, allDay: checked })
        }}
        onChangeStartTime={(time) => {
          const newStart = parse(time, "HH:mm", start)
          setDirtyEvent({ ...dirtyEvent, start: newStart })
        }}
        onChangeEndTime={(time) => {
          const newEnd = parse(time, "HH:mm", end)
          setDirtyEvent({ ...dirtyEvent, end: newEnd })
        }}
      />
    </div>
  )
}
