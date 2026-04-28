import { RefObject, useLayoutEffect, useRef } from "react"

import { formatDateKey } from "@/lib/event-time"

// When new sections are prepended (e.g. infinite scroll loading earlier events),
// the new DOM nodes push existing content downward. This hook detects prepends by
// watching the first section's date key and offsets scrollTop by the height delta
// so the user's viewport stays anchored on the same content.
export function usePreserveScrollOnPrepend({
  scrollContainerRef,
  sections,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  sections: { date: Date }[]
}) {
  const prevScrollHeightRef = useRef(0)
  const prevFirstKeyRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const currentFirstKey = sections.length > 0 ? formatDateKey(sections[0].date) : null

    if (prevFirstKeyRef.current && currentFirstKey && currentFirstKey !== prevFirstKeyRef.current) {
      const heightDelta = container.scrollHeight - prevScrollHeightRef.current
      if (heightDelta > 0) {
        container.scrollTop += heightDelta
      }
    }

    prevFirstKeyRef.current = currentFirstKey
    prevScrollHeightRef.current = container.scrollHeight
  }, [sections])
}
