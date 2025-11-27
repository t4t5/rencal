import { EventCard } from "@/components/event-card/EventCard"
import { ActionBar } from "@/components/header/ActionBar"

import { useEventComposer } from "@/contexts/EventComposerContext"

export function Header() {
  const { isComposing, text } = useEventComposer()

  const showDraftEvent = isComposing && text.length > 0

  return (
    <div className="flex flex-col gap-3 p-4 pb-0">
      <ActionBar />

      {showDraftEvent && <EventDraft />}
    </div>
  )
}

const EventDraft = () => {
  const { draftEvent, setDraftEvent } = useEventComposer()
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
    />
  )
}
