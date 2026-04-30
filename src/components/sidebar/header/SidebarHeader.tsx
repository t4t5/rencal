import { useEffect, useState } from "react"

import { ComposeEventInner } from "@/components/event-parts/ComposeEvent"
import { Card } from "@/components/ui/card"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { cn } from "@/lib/utils"

import { FlyToMinical } from "./FlyToMinical"
import { SidebarToolbar } from "./SidebarToolbar"
import { useFlyAnimation } from "./useFlyAnimation"

export function SidebarHeader() {
  const { isDrafting, setIsDrafting, isFlying } = useEventDraft()
  const { text } = useEventText()

  const { cardRef, hideCard, onCollapsed, flyRef } = useFlyAnimation()

  const showDraft = isDrafting && text.length > 0
  const effectiveShowDraft = showDraft || isFlying

  // Stay true briefly after effectiveShowDraft flips false, so the card
  // remains mounted while the collapse animation plays.
  const [renderDraft, setRenderDraft] = useState(effectiveShowDraft)

  useEffect(() => {
    if (effectiveShowDraft) {
      setRenderDraft(true)
    }
  }, [effectiveShowDraft])

  return (
    <div className="flex flex-col p-4 pb-0">
      <SidebarToolbar />

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          effectiveShowDraft ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        onTransitionEnd={() => {
          if (!effectiveShowDraft) {
            setRenderDraft(false)
            onCollapsed()
          }
        }}
      >
        <div className="overflow-hidden pt-4">
          {renderDraft && (
            <Card ref={cardRef} className={cn("p-0 flex flex-col gap-0", hideCard && "opacity-0")}>
              <ComposeEventInner onCreated={() => setIsDrafting(false)} />
            </Card>
          )}
        </div>
      </div>

      <FlyToMinical ref={flyRef} />
    </div>
  )
}
