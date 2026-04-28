/*
 * Parsed segments (time, location, recurrence) are highlighted by overlaying
 * dashed outline rectangles on top of input.
 * (We measure segment positions with a hidden <span> mirror,
 * then position absolute divs + translate them in
 * sync with input's scrollLeft)
 */
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { useCalendarNavigation } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { formatDateKey, toInteropDate } from "@/lib/event-time"
import { segmentEventText } from "@/lib/parse-event-text"
import { cn } from "@/lib/utils"

import { CloseIcon } from "@/icons/close"

interface OutlineRect {
  x: number
  width: number
}

export const ComposeEventInput = ({ onExit }: { onExit: () => void }) => {
  const { text, setText } = useEventText()
  const { isDrafting, setIsDrafting, setDefaultDraftEvent, createDraftEvent, draftEvent } =
    useEventDraft()
  const { navigateToDate } = useCalendarNavigation()
  const { canCreate, promptToConnect } = useCreateEventGate()
  const containerRef = useRef<HTMLDivElement>(null)
  const measurerRef = useRef<HTMLSpanElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [outlines, setOutlines] = useState<OutlineRect[]>([])

  const deferredText = useDeferredValue(text)
  // When text is empty, skip the deferred value: there's nothing to parse, and
  // using the stale deferred value would leave outlines lingering for a frame.
  const parseText = text === "" ? "" : deferredText
  const segments = useMemo(() => (parseText === "" ? [] : segmentEventText(parseText)), [parseText])
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
        m.textContent = parseText.slice(0, pos)
        const x = m.getBoundingClientRect().width
        m.textContent = seg.text
        const width = m.getBoundingClientRect().width
        rects.push({ x, width })
      }
      pos += seg.text.length
    }
    setOutlines(rects)
  }, [segments, parseText, hasParsedSegments])

  const syncScroll = useCallback(() => {
    const input = getInput()
    if (input) setScrollLeft(input.scrollLeft)
  }, [getInput])

  // Jump the event list to the draft's start date whenever it changes, so the
  // user can see where their event will land as they type.
  const draftStartKey = formatDateKey(draftEvent.start)
  const prevStartKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isDrafting) {
      prevStartKeyRef.current = null
      return
    }
    if (prevStartKeyRef.current !== null && prevStartKeyRef.current !== draftStartKey) {
      void navigateToDate(toInteropDate(draftEvent.start))
    }
    prevStartKeyRef.current = draftStartKey
  }, [isDrafting, draftStartKey])

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
