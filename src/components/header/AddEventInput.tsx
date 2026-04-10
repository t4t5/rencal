import { useCallback, useMemo, useRef } from "react"

import { Input } from "@/components/ui/input"

import { useEventDraft } from "@/contexts/EventDraftContext"

import { segmentEventText } from "@/lib/parse-event-text"
import { cn } from "@/lib/utils"

export const AddEventInput = ({ onExit }: { onExit: () => void }) => {
  const { text, setText, isDrafting, setIsDrafting, setDefaultDraftEvent } = useEventDraft()
  const overlayRef = useRef<HTMLDivElement>(null)

  const segments = useMemo(() => segmentEventText(text), [text])
  const hasParsedSegments = isDrafting && segments.some((s) => s.parsed)

  const syncScroll = useCallback(() => {
    const input = overlayRef.current?.parentElement?.querySelector("input")
    if (input && overlayRef.current) {
      overlayRef.current.scrollLeft = input.scrollLeft
    }
  }, [])

  return (
    <div className="relative w-full">
      {hasParsedSegments && (
        <div
          ref={overlayRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre px-3 py-1 text-sm"
        >
          {segments.map((seg, i) => (
            <span
              key={i}
              className={cn(
                seg.parsed &&
                  "rounded-sm outline-1 outline-dashed outline-muted-foreground/40 outline-offset-2",
              )}
            >
              {seg.text}
            </span>
          ))}
        </div>
      )}
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
            setDefaultDraftEvent()
            setIsDrafting(true)
          }
          syncScroll()
        }}
        onKeyDown={(e) => {
          if (!isDrafting) return
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
          hasParsedSegments && "text-transparent caret-foreground",
          !isDrafting && "cursor-pointer caret-transparent",
        )}
      />
    </div>
  )
}
