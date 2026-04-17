/*
 * Parsed segments (time, location, recurrence) are highlighted by overlaying
 * dashed outline rectangles on top of input.
 * (We measure segment positions with a hidden <span> mirror,
 * then position absolute divs + translate them in
 * sync with input's scrollLeft)
 */
import { useCallback, useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { segmentEventText } from "@/lib/parse-event-text"
import { cn } from "@/lib/utils"

import { CloseIcon } from "@/icons/close"

interface OutlineRect {
  x: number
  width: number
}

export const AddEventInput = ({ onExit }: { onExit: () => void }) => {
  const { text, setText } = useEventText()
  const { isDrafting, setIsDrafting, setDefaultDraftEvent, createDraftEvent } = useEventDraft()
  const containerRef = useRef<HTMLDivElement>(null)
  const measurerRef = useRef<HTMLSpanElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [outlines, setOutlines] = useState<OutlineRect[]>([])

  const deferredText = useDeferredValue(text)
  const segments = useMemo(() => segmentEventText(deferredText), [deferredText])
  const hasParsedSegments = isDrafting && segments.some((s) => s.parsed)

  const getInput = useCallback(() => containerRef.current?.querySelector("input") ?? null, [])

  useLayoutEffect(() => {
    const m = measurerRef.current
    if (!m || !hasParsedSegments) {
      setOutlines([])
      return
    }
    const rects: OutlineRect[] = []
    let pos = 0
    for (const seg of segments) {
      if (seg.parsed) {
        m.textContent = deferredText.slice(0, pos)
        const x = m.getBoundingClientRect().width
        m.textContent = seg.text
        const width = m.getBoundingClientRect().width
        rects.push({ x, width })
      }
      pos += seg.text.length
    }
    setOutlines(rects)
  }, [segments, deferredText, hasParsedSegments])

  const syncScroll = useCallback(() => {
    const input = getInput()
    if (input) setScrollLeft(input.scrollLeft)
  }, [getInput])

  return (
    <div ref={containerRef} className="relative w-full">
      {hasParsedSegments && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-md"
        >
          <div
            className="absolute inset-y-0"
            style={{
              left: 13,
              transform: `translateX(${-scrollLeft}px)`,
            }}
          >
            {outlines.map((r, i) => (
              <div
                key={i}
                className="absolute inset-y-1.5 rounded-sm outline-1 outline-dashed outline-muted-foreground/40 outline-offset-2"
                style={{ left: r.x, width: r.width }}
              />
            ))}
          </div>
        </div>
      )}
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
