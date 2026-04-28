import { useEffect, useRef, useState } from "react"

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
    if (hasInitiallyScrolledRef.current) return
    if (!hasEvents) return

    hasInitiallyScrolledRef.current = true

    setIsNavigating(true)

    // 1: browser paints scroll position:
    requestAnimationFrame(() => {
      // 2: intersectionObserver callbacks are processed:
      requestAnimationFrame(() => {
        scrollToDate(activeDate, "instant")
        setIsNavigating(false)
        // 3: scroll (and any ghost-section follow-up scroll) has settled:
        requestAnimationFrame(() => setHasInitiallyScrolled(true))
      })
    })
  }, [hasEvents])

  return hasInitiallyScrolled
}
