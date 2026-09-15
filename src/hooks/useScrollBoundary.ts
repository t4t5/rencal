import { RefObject, useEffect, useRef } from "react"

type Axis = "x" | "y" | "both"

type UseScrollBoundaryProps = {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  threshold?: number // pixels from edge (default: 100)
  scrollAwayThreshold?: number // pixels from both edges before boundary callbacks are armed
  throttleMs?: number // throttle delay (default: 150)
  axis?: Axis // which axis to watch (default: "y")
  onNearTop?: () => void
  onNearBottom?: () => void
  onNearLeft?: () => void
  onNearRight?: () => void
  checkOnMount?: boolean
  requireScrollAwayBeforeBoundary?: boolean
}

export const useScrollBoundary = ({
  scrollContainerRef,
  threshold = 100,
  scrollAwayThreshold = threshold,
  throttleMs = 150,
  axis = "y",
  onNearTop,
  onNearBottom,
  onNearLeft,
  onNearRight,
  checkOnMount = true,
  requireScrollAwayBeforeBoundary = false,
}: UseScrollBoundaryProps) => {
  const lastRunRef = useRef<number>(0)
  const hasScrolledAwayFromBoundaryRef = useRef(false)

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    let trailingTimer: ReturnType<typeof setTimeout> | undefined

    const checkBoundaries = () => {
      if (axis === "y" || axis === "both") {
        const { scrollTop, scrollHeight, clientHeight } = container
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight

        if (requireScrollAwayBeforeBoundary && !hasScrolledAwayFromBoundaryRef.current) {
          if (scrollTop >= scrollAwayThreshold && distanceFromBottom >= scrollAwayThreshold) {
            hasScrolledAwayFromBoundaryRef.current = true
          } else {
            return
          }
        }

        if (scrollTop < threshold) onNearTop?.()
        if (distanceFromBottom < threshold) onNearBottom?.()
      }

      if (axis === "x" || axis === "both") {
        const { scrollLeft, scrollWidth, clientWidth } = container
        const distanceFromRight = scrollWidth - scrollLeft - clientWidth

        if (requireScrollAwayBeforeBoundary && !hasScrolledAwayFromBoundaryRef.current) {
          if (scrollLeft >= scrollAwayThreshold && distanceFromRight >= scrollAwayThreshold) {
            hasScrolledAwayFromBoundaryRef.current = true
          } else {
            return
          }
        }

        if (scrollLeft < threshold) onNearLeft?.()
        if (distanceFromRight < threshold) onNearRight?.()
      }
    }

    const handleScroll = () => {
      const now = Date.now()
      const elapsed = now - lastRunRef.current

      // Run on the leading edge, but retain one trailing check so a fast gesture cannot
      // cross the preload boundary entirely inside the throttle window.
      if (elapsed >= throttleMs) {
        clearTimeout(trailingTimer)
        trailingTimer = undefined
        lastRunRef.current = now
        checkBoundaries()
      } else if (trailingTimer === undefined) {
        trailingTimer = setTimeout(() => {
          trailingTimer = undefined
          lastRunRef.current = Date.now()
          checkBoundaries()
        }, throttleMs - elapsed)
      }
    }

    container.addEventListener("scroll", handleScroll, { passive: true })

    // Check boundaries on mount when desired. Some virtualized views perform an
    // initial programmatic scroll; checking before that scroll lands incorrectly
    // treats the initial scrollTop=0 as user intent to prepend.
    let rafId: number | null = null
    if (checkOnMount) {
      rafId = requestAnimationFrame(() => {
        checkBoundaries()
      })
    }

    return () => {
      container.removeEventListener("scroll", handleScroll)
      clearTimeout(trailingTimer)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [
    scrollContainerRef,
    threshold,
    scrollAwayThreshold,
    throttleMs,
    axis,
    onNearTop,
    onNearBottom,
    onNearLeft,
    onNearRight,
    checkOnMount,
    requireScrollAwayBeforeBoundary,
  ])
}
