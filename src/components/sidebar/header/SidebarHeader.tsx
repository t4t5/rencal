import { useEffect, useRef, useState } from "react"

import { ComposeEventInner } from "@/components/event-parts/ComposeEvent"
import { Card } from "@/components/ui/card"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { cn } from "@/lib/utils"

import { FlyToMinical, type FlyToMinicalHandle } from "./FlyToMinical"
import { SidebarToolbar } from "./SidebarToolbar"

export function SidebarHeader() {
  const { isDrafting, setIsDrafting, beforeCreateHandlerRef } = useEventDraft()
  const { text } = useEventText()

  const showDraft = isDrafting && text.length > 0

  // Stay true briefly after showDraft flips false, so the card
  // remains mounted while the collapse animation plays.
  const [renderDraft, setRenderDraft] = useState(showDraft)

  const cardRef = useRef<HTMLDivElement>(null)
  const flyRef = useRef<FlyToMinicalHandle>(null)

  useEffect(() => {
    if (showDraft) {
      setRenderDraft(true)
    }
  }, [showDraft])

  useEffect(() => {
    beforeCreateHandlerRef.current = (start) => {
      if (cardRef.current) {
        flyRef.current?.fly(cardRef.current, start)
      }
    }
    return () => {
      beforeCreateHandlerRef.current = null
    }
  }, [beforeCreateHandlerRef])

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
        <div className="overflow-hidden pt-4">
          {renderDraft && (
            <Card ref={cardRef} className="p-0 flex flex-col gap-0">
              <ComposeEventInner onCreated={() => setIsDrafting(false)} />
            </Card>
          )}
        </div>
      </div>

      <FlyToMinical ref={flyRef} />
    </div>
  )
}
