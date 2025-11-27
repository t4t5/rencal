import { EventCard } from "@/components/event-card/EventCard"
import { ActionBar } from "@/components/header/ActionBar"

import { useEventComposer } from "@/contexts/EventComposerContext"

export function Header() {
  const { isComposing, text } = useEventComposer()

  const showPreview = isComposing && text.length > 0

  return (
    <div className="flex flex-col gap-3 p-4 pb-0">
      <ActionBar />

      {showPreview && <EventCard title={text} />}
    </div>
  )
}
