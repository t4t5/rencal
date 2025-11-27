import { parse } from "date-fns"

import { EventCard } from "@/components/event-card/EventCard"
import { ActionBar } from "@/components/header/ActionBar"

import { useEventDraft } from "@/contexts/EventDraftContext"

export function Header() {
  const { isDrafting, text } = useEventDraft()

  const showDraftEvent = isDrafting && text.length > 0

  return (
    <div className="flex flex-col gap-3 p-4 pb-0">
      <ActionBar />

      {showDraftEvent && <EventDraft />}
    </div>
  )
}

const EventDraft = () => {
  const { draftEvent, setDraftEvent } = useEventDraft()

  const { summary, start, end, allDay } = draftEvent

  return (
    <EventCard
      summary={summary}
      start={start}
      end={end}
      allDay={allDay}
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
  )
}
