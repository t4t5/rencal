import { useEffect, useRef, useState } from "react"

import { ComposeEventInner } from "@/components/event-parts/ComposeEvent"
import { Card } from "@/components/ui/card"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { cn } from "@/lib/utils"

import { FlyAnimationProvider, FlyToMinical, useFlyAnimation } from "./FlyAnimation"
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
  const collapseRef = useRef<HTMLDivElement>(null)

  const finishCollapse = () => {
    setRenderDraft(false)
    onCollapsed()
  }

  useEffect(() => {
    if (showDraft) {
      setRenderDraft(true)
      return
    }
    // Themes may disable transitions, in which case transitionend never fires.
    const el = collapseRef.current
    if (renderDraft && el && !hasTransition(el)) finishCollapse()
  }, [showDraft])

  return (
    <div data-slot="sidebar-header" className="flex flex-col p-(--layout-padding) pb-0">
      <SidebarToolbar />

      <div
        ref={collapseRef}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          showDraft ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        onTransitionEnd={() => {
          if (!showDraft) finishCollapse()
        }}
      >
        <div data-slot="sidebar-draft" className="overflow-hidden pt-4">
          {renderDraft && (
            <Card ref={cardRef} className={cn("p-0 flex flex-col gap-0", hideCard && "opacity-0")}>
              <ComposeEventInner
                onBeforeCreate={startFlight}
                onCreated={() => setIsDrafting(false)}
                onTabOut={() => {
                  document.querySelector<HTMLInputElement>("[data-compose-event-input]")?.focus()
                }}
              />
            </Card>
          )}
        </div>
      </div>

      <FlyToMinical ref={flyRef} />
    </div>
  )
}

function hasTransition(el: HTMLElement) {
  return getComputedStyle(el)
    .transitionDuration.split(",")
    .some((duration) => parseFloat(duration) > 0)
}
