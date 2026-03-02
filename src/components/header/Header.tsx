import { NewEvent } from "@/components/event-info/NewEvent"
import { ActionBar } from "@/components/header/ActionBar"

import { useEventDraft } from "@/contexts/EventDraftContext"

import { cn, isMacOS } from "@/lib/utils"

export function Header() {
  const { isDrafting, text } = useEventDraft()

  const showDraftEvent = isDrafting && text.length > 0

  return (
    <div className={cn("flex flex-col gap-3 p-4 pb-0", isMacOS && "pl-[78px]")}>
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
