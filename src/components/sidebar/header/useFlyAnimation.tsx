/**
 * Confirmation animation for new events created from the sidebar header:
 * a translucent duplicate of the compose card detaches, shrinks, and flies
 * into the date cell in the minical where the event starts.
 *
 * We want it to feel like the card the user worked on is what's flying,
 * so we hide the original the
 * instant the clone takes off and keep the section frozen open until the
 * flight finishes.
 *
 *   1. User submits → `beforeCreateHandlerRef` fires synchronously, before
 *      any draft state resets, so we can snapshot the card at full size.
 *   2. The clone is rendered as a fixed-position overlay (see FlyToMinical)
 *      and starts its translate+scale toward the target cell.
 *   3. The original card flips to `opacity-0` and the section is held open
 *      via `freezing` so the layout doesn't shift while the clone is in
 *      flight (otherwise it would visually detach from its starting spot).
 *   4. After FREEZE_MS the freeze releases and the section collapses
 *      normally. `hideCard` stays true through the collapse so the original
 *      never flashes back into view, then resets when the card unmounts.
 */
import { useCallback, useEffect, useRef, useState } from "react"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { type FlyToMinicalHandle } from "./FlyToMinical"

export const FREEZE_MS = 950

export function useFlyAnimation() {
  const { beforeCreateHandlerRef, setFreezing } = useEventDraft()
  const { setText } = useEventText()

  // `hideCard` keeps the original card invisible through both the freeze AND
  // the subsequent grid collapse so it doesn't flash back into view as the
  // section closes.
  const [hideCard, setHideCard] = useState(false)
  const freezeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cardRef = useRef<HTMLDivElement>(null)
  const flyRef = useRef<FlyToMinicalHandle>(null)

  useEffect(() => {
    beforeCreateHandlerRef.current = (start) => {
      if (!cardRef.current) return
      flyRef.current?.fly(cardRef.current, start)
      setFreezing(true)
      setHideCard(true)
      if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current)
      freezeTimerRef.current = setTimeout(() => {
        setFreezing(false)
        setText("")
      }, FREEZE_MS)
    }

    return () => {
      beforeCreateHandlerRef.current = null
    }
  }, [beforeCreateHandlerRef, setFreezing, setText])

  useEffect(() => {
    return () => {
      if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current)
    }
  }, [])

  const onCollapsed = useCallback(() => {
    setHideCard(false)
  }, [])

  return {
    cardRef,
    hideCard,
    onCollapsed,
    flyRef,
  }
}
