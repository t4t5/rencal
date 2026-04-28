/*
 * Magic (parsed) segments (time, location, recurrence) are highlighted by overlaying
 * dashed outline rectangles on top of input.
 * (We measure segment positions with a hidden <span> mirror,
 * then position absolute divs + translate them in
 * sync with input's scrollLeft)
 */
import { useCallback, useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from "react"

import { segmentEventText } from "@/lib/parse-event-text"

interface OutlineRect {
  x: number
  width: number
}

export const useMagicSegmentOutlines = ({
  text,
  enabled,
  getInput,
}: {
  text: string
  enabled: boolean
  getInput: () => HTMLInputElement | null
}) => {
  const measurerRef = useRef<HTMLSpanElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [outlines, setOutlines] = useState<OutlineRect[]>([])

  const deferredText = useDeferredValue(text)
  // When text is empty, skip the deferred value: there's nothing to parse, and
  // using the stale deferred value would leave outlines lingering for a frame.
  const parseText = text === "" ? "" : deferredText
  const segments = useMemo(() => (parseText === "" ? [] : segmentEventText(parseText)), [parseText])
  const hasMagicSegments = enabled && segments.some((s) => s.parsed)

  useLayoutEffect(() => {
    const m = measurerRef.current
    if (!m || !hasMagicSegments) {
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
  }, [segments, parseText, hasMagicSegments])

  const syncScroll = useCallback(() => {
    const input = getInput()
    if (input) setScrollLeft(input.scrollLeft)
  }, [getInput])

  return { measurerRef, outlines, scrollLeft, syncScroll, hasMagicSegments }
}

export const MagicSegmentsOverlay = ({
  scrollLeft,
  outlines,
}: {
  scrollLeft: number
  outlines: OutlineRect[]
}) => {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
      <div
        className="absolute inset-y-0"
        style={{
          left: 13,
          transform: `translateX(${-scrollLeft}px)`,
        }}
      >
        {outlines.map((outlineRect, index) => (
          <MagicSegment key={index} outlineRect={outlineRect} />
        ))}
      </div>
    </div>
  )
}

const MagicSegment = ({ outlineRect }: { outlineRect: OutlineRect }) => {
  const { x: left, width } = outlineRect

  return (
    <div
      className="absolute inset-y-1.5 rounded-sm outline-1 outline-dashed outline-muted-foreground/40 outline-offset-2"
      style={{ left, width }}
    />
  )
}
