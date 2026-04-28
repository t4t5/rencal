import { useEffect, useState } from "react"

import { ComposeEventInner } from "@/components/event-parts/ComposeEvent"
import { Card } from "@/components/ui/card"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { cn } from "@/lib/utils"

import { SidebarToolbar } from "./SidebarToolbar"

export function SidebarHeader() {
  const { isDrafting } = useEventDraft()
  const { text } = useEventText()

  const showDraftEvent = isDrafting && text.length > 0
  const [mounted, setMounted] = useState(showDraftEvent)

  useEffect(() => {
    if (showDraftEvent) {
      setMounted(true)
    }
  }, [showDraftEvent])

  return (
    <div className="flex flex-col p-4 pb-0">
      <SidebarToolbar />

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          showDraftEvent ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        onTransitionEnd={() => {
          if (!showDraftEvent) {
            setMounted(false)
          }
        }}
      >
        <div className="overflow-hidden pt-4">{mounted && <ComposeEventCard />}</div>
      </div>
    </div>
  )
}

export const ComposeEventCard = () => {
  const { setIsDrafting } = useEventDraft()

  return (
    <Card className="p-0 flex flex-col gap-0">
      <ComposeEventInner onCreated={() => setIsDrafting(false)} />
    </Card>
  )
}
