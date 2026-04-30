import { useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { useCalendarNavigation } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { type EventTime, formatDateKey, toInteropDate } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { CloseIcon } from "@/icons/close"

import { MagicSegments } from "./MagicSegments"

export const ComposeEventInput = ({ onExit }: { onExit: () => void }) => {
  const { text, setText } = useEventText()
  const {
    isDrafting,
    setIsDrafting,
    setDefaultDraftEvent,
    createDraftEvent,
    draftEvent,
    freezing,
  } = useEventDraft()

  // Keep showing the typed text through the post-create fly animation.
  const showText = isDrafting || freezing
  const { canCreate, promptToConnect } = useCreateEventGate()

  const inputRef = useRef<HTMLInputElement>(null)

  // Automatically jump to the day the event is created for:
  useJumpToStartDate({ isDrafting, draftStart: draftEvent.start })

  return (
    <div className="relative w-full">
      {showText && <MagicSegments text={text} inputRef={inputRef} />}

      <Input
        ref={inputRef}
        ghost={false}
        value={showText ? text : ""}
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
          showText && text && "pr-9",
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
