import { RefObject, useEffect, useRef } from "react"

type Axis = "x" | "y" | "both"

type UseScrollBoundaryProps = {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  enabled?: boolean
  threshold?: number // pixels from edge (default: 100)
  throttleMs?: number // throttle delay (default: 150)
  axis?: Axis // which axis to watch (default: "y")
  onNearTop?: () => void
  onNearBottom?: () => void
  onNearLeft?: () => void
  onNearRight?: () => void
}

export const useScrollBoundary = ({
  scrollContainerRef,
  enabled = true,
  threshold = 100,
  throttleMs = 150,
  axis = "y",
  onNearTop,
  onNearBottom,
  onNearLeft,
  onNearRight,
}: UseScrollBoundaryProps) => {
  const lastRunRef = useRef<number>(0)

  useEffect(() => {
    if (!enabled) return

    const container = scrollContainerRef.current
    if (!container) return

    const checkBoundaries = () => {
      if (axis === "y" || axis === "both") {
        const { scrollTop, scrollHeight, clientHeight } = container
        if (scrollTop < threshold) onNearTop?.()
        if (scrollHeight - scrollTop - clientHeight < threshold) onNearBottom?.()
      }

      if (axis === "x" || axis === "both") {
        const { scrollLeft, scrollWidth, clientWidth } = container
        if (scrollLeft < threshold) onNearLeft?.()
        if (scrollWidth - scrollLeft - clientWidth < threshold) onNearRight?.()
      }
    }

    const handleScroll = () => {
      const now = Date.now()

      // Throttle: run immediately on first call, then at most once per throttleMs
      if (now - lastRunRef.current >= throttleMs) {
        lastRunRef.current = now
        checkBoundaries()
      }
    }

    container.addEventListener("scroll", handleScroll, { passive: true })

    // Check boundaries on mount
    // (fixes issue where user scrolls very fast to top/bottom)
    const rafId = requestAnimationFrame(() => {
      checkBoundaries()
    })

    return () => {
      cancelAnimationFrame(rafId)
      container.removeEventListener("scroll", handleScroll)
    }
  }, [
    scrollContainerRef,
    threshold,
    throttleMs,
    axis,
    onNearTop,
    onNearBottom,
    onNearLeft,
    onNearRight,
    enabled,
  ])
}
