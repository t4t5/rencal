import { useEffect, useRef, useState } from "react"

import { createDebugLogger } from "@/lib/debug"
import { formatDateKey } from "@/lib/event-time"

const debug = createDebugLogger("agenda")

// On first load, scroll to the active date as soon as events arrive.
// The rAF chain lets the browser paint, then process IntersectionObserver
// callbacks, before we clear the navigating flag and reveal the list.
// Returns hasInitiallyScrolled so the caller can keep the list invisible
// until the scroll has settled and avoid a flash at the top.
export function useInitialScrollToActiveDate({
  hasEvents,
  activeDate,
  scrollToDate,
  setIsNavigating,
}: {
  hasEvents: boolean
  activeDate: Date
  scrollToDate: (date: Date, behavior: ScrollBehavior) => void
  setIsNavigating: (navigating: boolean) => void
}) {
  const [hasInitiallyScrolled, setHasInitiallyScrolled] = useState(false)
  const hasInitiallyScrolledRef = useRef(false)

  useEffect(() => {
    debug("initial-scroll effect", {
      hasAlreadyScrolled: hasInitiallyScrolledRef.current,
      hasEvents,
      activeDate: formatDateKey(activeDate),
    })
    if (hasInitiallyScrolledRef.current) return
    if (!hasEvents) return

    hasInitiallyScrolledRef.current = true

    debug("initial-scroll start", { activeDate: formatDateKey(activeDate) })
    setIsNavigating(true)

    // 1: browser paints scroll position:
    requestAnimationFrame(() => {
      debug("initial-scroll rAF 1", { activeDate: formatDateKey(activeDate) })
      // 2: intersectionObserver callbacks are processed:
      requestAnimationFrame(() => {
        debug("initial-scroll rAF 2 before scrollToDate", { activeDate: formatDateKey(activeDate) })
        scrollToDate(activeDate, "instant")
        setIsNavigating(false)
        debug("initial-scroll rAF 2 after scrollToDate", { activeDate: formatDateKey(activeDate) })
        // 3: scroll (and any ghost-section follow-up scroll) has settled:
        requestAnimationFrame(() => {
          debug("initial-scroll reveal", { activeDate: formatDateKey(activeDate) })
          setHasInitiallyScrolled(true)
        })
      })
    })
  }, [hasEvents])

  return hasInitiallyScrolled
}
