import { Temporal } from "@js-temporal/polyfill"
import { RefObject, useLayoutEffect, useRef } from "react"

// When new sections are prepended (e.g. infinite scroll loading earlier events),
// the new DOM nodes push existing content downward. This hook detects prepends by
// watching the first section's date and offsets scrollTop by the height delta
// so the user's viewport stays anchored on the same content.
export function usePreserveScrollOnPrepend({
  scrollContainerRef,
  sections,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  sections: { date: Temporal.PlainDate }[]
}) {
  const prevScrollHeightRef = useRef(0)
  const prevFirstDateRef = useRef<Temporal.PlainDate | null>(null)

  useLayoutEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const currentFirstDate = sections[0]?.date ?? null

    if (
      prevFirstDateRef.current &&
      currentFirstDate &&
      !currentFirstDate.equals(prevFirstDateRef.current)
    ) {
      const heightDelta = container.scrollHeight - prevScrollHeightRef.current
      if (heightDelta > 0) {
        container.scrollTop += heightDelta
      }
    }

    prevFirstDateRef.current = currentFirstDate
    prevScrollHeightRef.current = container.scrollHeight
  }, [sections])
}
