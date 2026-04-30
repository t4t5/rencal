import { useEffect, useState } from "react"

import { ComposeEventInner } from "@/components/event-parts/ComposeEvent"
import { Card } from "@/components/ui/card"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { cn } from "@/lib/utils"

import { FlyAnimationProvider, useFlyAnimation } from "./FlyAnimation"
import { FlyToMinical } from "./FlyToMinical"
import { SidebarToolbar } from "./SidebarToolbar"

export function SidebarHeader() {
  return (
    <FlyAnimationProvider>
      <SidebarHeaderContent />
    </FlyAnimationProvider>
  )
}

function SidebarHeaderContent() {
  const { isDrafting, setIsDrafting } = useEventDraft()
  const { text } = useEventText()

  const { cardRef, hideCard, onCollapsed, flyRef, isFlying, startFlight } = useFlyAnimation()

  const showDraft = (isDrafting && text.length > 0) || isFlying

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
            onCollapsed()
          }
        }}
      >
        <div className="overflow-hidden pt-4">
          {renderDraft && (
            <Card ref={cardRef} className={cn("p-0 flex flex-col gap-0", hideCard && "opacity-0")}>
              <ComposeEventInner
                onBeforeCreate={startFlight}
                onCreated={() => setIsDrafting(false)}
              />
            </Card>
          )}
        </div>
      </div>

      <FlyToMinical ref={flyRef} />
    </div>
  )
}
