import { useEffect, useRef, useState } from "react"

import { ComposeEventInner } from "@/components/event-parts/ComposeEvent"
import { Card } from "@/components/ui/card"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { cn } from "@/lib/utils"

import { FlyToMinical, type FlyToMinicalHandle } from "./FlyToMinical"
import { SidebarToolbar } from "./SidebarToolbar"

const FREEZE_MS = 1250

export function SidebarHeader() {
  const { isDrafting, setIsDrafting, beforeCreateHandlerRef } = useEventDraft()
  const { text } = useEventText()

  const showDraft = isDrafting && text.length > 0

  // While `freezing`, the grid stays open and the original card is hidden,
  // so visually only the cloned card flying into the minical is on screen.
  const [freezing, setFreezing] = useState(false)
  const freezeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const effectiveShowDraft = showDraft || freezing

  // Stay true briefly after effectiveShowDraft flips false, so the card
  // remains mounted while the collapse animation plays.
  const [renderDraft, setRenderDraft] = useState(effectiveShowDraft)

  const cardRef = useRef<HTMLDivElement>(null)
  const flyRef = useRef<FlyToMinicalHandle>(null)

  useEffect(() => {
    if (effectiveShowDraft) {
      setRenderDraft(true)
    }
  }, [effectiveShowDraft])

  useEffect(() => {
    beforeCreateHandlerRef.current = (start) => {
      if (!cardRef.current) return
      flyRef.current?.fly(cardRef.current, start)
      setFreezing(true)
      if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current)
      freezeTimerRef.current = setTimeout(() => setFreezing(false), FREEZE_MS)
    }
    return () => {
      beforeCreateHandlerRef.current = null
    }
  }, [beforeCreateHandlerRef])

  useEffect(() => {
    return () => {
      if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current)
    }
  }, [])

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
          }
        }}
      >
        <div className="overflow-hidden pt-4">
          {renderDraft && (
            <Card ref={cardRef} className={cn("p-0 flex flex-col gap-0", freezing && "opacity-0")}>
              <ComposeEventInner onCreated={() => setIsDrafting(false)} />
            </Card>
          )}
        </div>
      </div>

      <FlyToMinical ref={flyRef} />
    </div>
  )
}
