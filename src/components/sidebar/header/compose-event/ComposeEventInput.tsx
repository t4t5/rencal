import { useCallback, useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { useCalendarNavigation } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { type EventTime, formatDateKey, toInteropDate } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { CloseIcon } from "@/icons/close"

import { MagicSegmentsOverlay, useMagicSegmentOutlines } from "./MagicSegments"

export const ComposeEventInput = ({ onExit }: { onExit: () => void }) => {
  const { text, setText } = useEventText()
  const { isDrafting, setIsDrafting, setDefaultDraftEvent, createDraftEvent, draftEvent } =
    useEventDraft()
  const { canCreate, promptToConnect } = useCreateEventGate()

  const containerRef = useRef<HTMLDivElement>(null)

  const getInput = useCallback(() => containerRef.current?.querySelector("input") ?? null, [])

  // Get magic segments like "tomorrow at 7pm", "in London", etc.
  const { measurerRef, outlines, scrollLeft, syncScroll, hasMagicSegments } =
    useMagicSegmentOutlines({ text, enabled: isDrafting, getInput })

  useJumpToStartDate({ isDrafting, draftStart: draftEvent.start })

  return (
    <div ref={containerRef} className="relative w-full">
      {hasMagicSegments && <MagicSegmentsOverlay outlines={outlines} scrollLeft={scrollLeft} />}

      <span
        ref={measurerRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre text-sm"
      />

      <Input
        ghost={false}
        value={isDrafting ? text : ""}
        placeholder={isDrafting ? "Meeting at 3pm" : ""}
        readOnly={!isDrafting}
        tabIndex={isDrafting ? 0 : -1}
        onChange={(e) => {
          setText(e.target.value)
          syncScroll()
        }}
        onScroll={syncScroll}
        onSelect={syncScroll}
        onClick={() => {
          if (!isDrafting) {
            if (!canCreate) {
              promptToConnect()
              return
            }
            setDefaultDraftEvent()
            setIsDrafting(true)
          }
          syncScroll()
        }}
        onKeyDown={(e) => {
          if (!isDrafting) return
          if (e.key === "Enter" && text) {
            e.preventDefault()
            void createDraftEvent().then(onExit)
          }
          if (e.key === "Escape") {
            if (text) {
              setText("")
            } else {
              onExit()
            }
          }
          syncScroll()
        }}
        className={cn(
          "w-full",
          !isDrafting && "cursor-pointer caret-transparent",
          isDrafting && text && "pr-9",
        )}
      />

      {isDrafting && text && (
        <Button
          variant="ghost"
          size="icon-xs"
          round
          aria-label="Clear"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setText("")
            getInput()?.focus()
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          <CloseIcon className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

// Jump the event list to the draft's start date whenever it changes, so the
// user can see where their event will land as they type.
const useJumpToStartDate = ({
  isDrafting,
  draftStart,
}: {
  isDrafting: boolean
  draftStart: EventTime
}) => {
  const { navigateToDate } = useCalendarNavigation()
  const draftStartKey = formatDateKey(draftStart)
  const prevStartKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isDrafting) {
      prevStartKeyRef.current = null
      return
    }
    if (prevStartKeyRef.current !== null && prevStartKeyRef.current !== draftStartKey) {
      void navigateToDate(toInteropDate(draftStart))
    }
    prevStartKeyRef.current = draftStartKey
  }, [isDrafting, draftStartKey])
}
