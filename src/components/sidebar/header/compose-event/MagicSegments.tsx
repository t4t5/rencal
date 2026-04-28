/*
 * Magic (parsed) segments (time, location, recurrence) are highlighted by overlaying
 * dashed outline rectangles on top of input.
 * (We measure segment positions with a hidden <span> mirror,
 * then position absolute divs + translate them in
 * sync with input's scrollLeft)
 */
import {
  type RefObject,
  useDeferredValue,
  useEffect,
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

export const MagicSegments = ({
  text,
  inputRef,
}: {
  text: string
  inputRef: RefObject<HTMLInputElement | null>
}) => {
  // Get magic segments like "tomorrow at 7pm", "in London", etc.
  const { measurerRef, magicOutlines, scrollLeft, hasMagicSegments } = useMagicSegmentOutlines({
    text,
    inputRef,
  })

  return (
    <>
      {hasMagicSegments && (
        <MagicSegmentsOverlay magicOutlines={magicOutlines} scrollLeft={scrollLeft} />
      )}

      <span
        ref={measurerRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre text-sm"
      />
    </>
  )
}

const useMagicSegmentOutlines = ({
  text,
  inputRef,
}: {
  text: string
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
  const hasMagicSegments = segments.some((s) => s.parsed)

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

  // Keep `scrollLeft` in sync with the input. `selectionchange` (document-level) fires
  // after the browser auto-scrolls the input to keep the caret visible, so it's the
  // reliable hook for caret-driven moves; `keydown` fires too early.
  useEffect(() => {
    const input = inputRef.current
    if (!input) return

    const sync = () => setScrollLeft(input.scrollLeft)

    input.addEventListener("scroll", sync, { passive: true })
    input.addEventListener("input", sync)
    document.addEventListener("selectionchange", sync)

    return () => {
      input.removeEventListener("scroll", sync)
      input.removeEventListener("input", sync)
      document.removeEventListener("selectionchange", sync)
    }
  }, [inputRef])

  return { measurerRef, magicOutlines, scrollLeft, hasMagicSegments }
}

const MagicSegmentsOverlay = ({
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
