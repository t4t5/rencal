import { useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { useCalendarNavigation } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { type EventTime, formatDateKey, toInteropDate } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { CloseIcon } from "@/icons/close"

import { useFlyAnimation } from "../FlyAnimation"
import { MagicSegments } from "./MagicSegments"

export const ComposeEventInput = ({ onExit }: { onExit: () => void }) => {
  const { text, setText } = useEventText()
  const { isDrafting, setIsDrafting, setDefaultDraftEvent, createDraftEvent, draftEvent } =
    useEventDraft()
  const { isFlying, flyingText, startFlight } = useFlyAnimation()

  // Keep showing the typed text through the post-create fly animation.
  // While flying, the live `text` has already been cleared by
  // `createDraftEvent`, so we read the snapshot the animation captured.
  const showText = isDrafting || isFlying
  const displayText = isFlying ? flyingText : text
  const { canCreate, promptToConnect } = useCreateEventGate()

  const inputRef = useRef<HTMLInputElement>(null)

  // Automatically jump to the day the event is created for:
  useJumpToStartDate({ isDrafting, draftStart: draftEvent.start })

  return (
    <div className="relative w-full">
      {showText && <MagicSegments text={displayText} inputRef={inputRef} />}

      <Input
        ref={inputRef}
        ghost={false}
        value={showText ? displayText : ""}
        placeholder={isDrafting ? "Meeting at 3pm" : ""}
        readOnly={!isDrafting}
        tabIndex={isDrafting ? 0 : -1}
        onChange={(e) => setText(e.target.value)}
        onClick={() => {
          if (isDrafting) return
          if (!canCreate) {
            promptToConnect()
            return
          }
          setDefaultDraftEvent()
          setIsDrafting(true)
        }}
        onKeyDown={(e) => {
          if (!isDrafting) return

          if (e.key === "Enter" && text) {
            e.preventDefault()
            startFlight(draftEvent.start)
            void createDraftEvent().then(onExit)
          }

          // Hitting escape once clears the text
          // Hitting it again exits compose mode
          if (e.key === "Escape") {
            if (text) {
              setText("")
            } else {
              onExit()
            }
          }
        }}
        className={cn(
          "w-full",
          !isDrafting && "cursor-pointer caret-transparent",
          showText && displayText && "pr-9",
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
            inputRef.current?.focus()
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          <CloseIcon className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

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
