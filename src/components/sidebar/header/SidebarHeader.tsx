import { useEffect, useState } from "react"

import { ComposeEventInner } from "@/components/event-parts/ComposeEvent"
import { Card } from "@/components/ui/card"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { cn } from "@/lib/utils"

import { SidebarToolbar } from "./SidebarToolbar"

export function SidebarHeader() {
  const { isDrafting } = useEventDraft()
  const { text } = useEventText()

  const showDraft = isDrafting && text.length > 0

  // Stay true briefly after showDraft flips false, so the card
  // remains mounted while the collapse animation plays.
  const [renderDraft, setRenderDraft] = useState(showDraft)

  useEffect(() => {
    if (showDraft) {
      setRenderDraft(true)
    }
  }, [showDraft])

  return (
    <div className="flex flex-col p-4 pb-0">
      <SidebarToolbar />

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          showDraft ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        onTransitionEnd={() => {
          if (!showDraft) {
            setRenderDraft(false)
          }
        }}
      >
        <div className="overflow-hidden pt-4">{renderDraft && <ComposeEventCard />}</div>
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
