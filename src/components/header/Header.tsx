import { NewEvent } from "@/components/event-info/NewEvent"
import { ActionBar } from "@/components/header/ActionBar"

import { useEventDraft } from "@/contexts/EventDraftContext"

export function Header() {
  const { isDrafting, text } = useEventDraft()

  const showDraftEvent = isDrafting && text.length > 0

  return (
    <div className="flex flex-col gap-3 p-4 pb-0">
      <ActionBar />

      {showDraftEvent && <NewEvent />}
    </div>
  )
}
