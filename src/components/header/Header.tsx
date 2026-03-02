import { NewEvent } from "@/components/event-info/NewEvent"
import { ActionBar } from "@/components/header/ActionBar"

import { useEventDraft } from "@/contexts/EventDraftContext"

import { cn } from "@/lib/utils"

export function Header() {
  const { isDrafting, text } = useEventDraft()

  const showDraftEvent = isDrafting && text.length > 0

  return (
    <div className="flex flex-col gap-3 pt-4 pr-4 pb-0 pl-[78px]">
      <ActionBar />

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          showDraftEvent ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <NewEvent />
        </div>
      </div>
    </div>
  )
}
