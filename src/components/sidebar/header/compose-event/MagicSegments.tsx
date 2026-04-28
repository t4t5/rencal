/*
 * Magic (parsed) segments (time, location, recurrence) are highlighted by overlaying
 * dashed outline rectangles on top of input.
 * (We measure segment positions with a hidden <span> mirror,
 * then position absolute divs + translate them in
 * sync with input's scrollLeft)
 */
import {
  type RefObject,
  useCallback,
  useDeferredValue,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { segmentEventText } from "@/lib/parse-event-text"

interface MagicOutline {
  x: number
  width: number
}

export const useMagicSegmentOutlines = ({
  text,
  enabled,
  inputRef,
}: {
  text: string
  enabled: boolean
  inputRef: RefObject<HTMLInputElement | null>
}) => {
  const measurerRef = useRef<HTMLSpanElement>(null)

  const [scrollLeft, setScrollLeft] = useState(0)

  const [magicOutlines, setMagicOutlines] = useState<MagicOutline[]>([])

  const deferredText = useDeferredValue(text)
  // When text is empty, skip the deferred value: there's nothing to parse, and
  // using the stale deferred value would leave outlines lingering for a frame.
  const parseText = text === "" ? "" : deferredText
  const segments = useMemo(() => (parseText === "" ? [] : segmentEventText(parseText)), [parseText])
  const hasMagicSegments = enabled && segments.some((s) => s.parsed)

  useLayoutEffect(() => {
    const m = measurerRef.current

    if (!m || !hasMagicSegments) {
      setMagicOutlines([])
      return
    }

    const outlines: MagicOutline[] = []

    let pos = 0

    for (const seg of segments) {
      if (seg.parsed) {
        m.textContent = parseText.slice(0, pos)
        const x = m.getBoundingClientRect().width
        m.textContent = seg.text
        const width = m.getBoundingClientRect().width
        outlines.push({ x, width })
      }
      pos += seg.text.length
    }

    setMagicOutlines(outlines)
  }, [segments, parseText, hasMagicSegments])

  const repositionMagicSegments = useCallback(() => {
    const input = inputRef.current
    if (input) setScrollLeft(input.scrollLeft)
  }, [inputRef])

  return { measurerRef, magicOutlines, scrollLeft, repositionMagicSegments, hasMagicSegments }
}

export const MagicSegmentsOverlay = ({
  scrollLeft,
  magicOutlines,
}: {
  scrollLeft: number
  magicOutlines: MagicOutline[]
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
        {magicOutlines.map((magicOutline, index) => (
          <MagicSegment key={index} magicOutline={magicOutline} />
        ))}
      </div>
    </div>
  )
}

const MagicSegment = ({ magicOutline }: { magicOutline: MagicOutline }) => {
  const { x: left, width } = magicOutline

  return (
    <div
      className="absolute inset-y-1.5 rounded-sm outline-1 outline-dashed outline-muted-foreground/40 outline-offset-2"
      style={{ left, width }}
    />
  )
}
