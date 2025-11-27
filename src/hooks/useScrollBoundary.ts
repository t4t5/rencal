import { RefObject, useEffect, useRef } from "react"

export const useScrollBoundary = ({
  scrollContainerRef,
  threshold = 100,
  throttleMs = 150,
  onNearTop,
  onNearBottom,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  threshold?: number // pixels from edge (default: 100)
  throttleMs?: number // throttle delay (default: 150)
  onNearTop?: () => void
  onNearBottom?: () => void
}) => {
  const lastRunRef = useRef<number>(0)

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    console.log("CHANGED")

    const checkBoundaries = () => {
      const { scrollTop, scrollHeight, clientHeight } = container

      const isCloseToTop = scrollTop < threshold
      const isCloseToBottom = scrollHeight - scrollTop - clientHeight < threshold

      if (isCloseToTop) {
        onNearTop?.()
      }

      if (isCloseToBottom) {
        onNearBottom?.()
      }
    }

    const handleScroll = () => {
      console.log("handle")
      const now = Date.now()

      // Throttle: run immediately on first call, then at most once per throttleMs
      if (now - lastRunRef.current >= throttleMs) {
        lastRunRef.current = now
        checkBoundaries()
      }
    }

    console.log("add listener")
    container.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      console.log("remove listener")
      container.removeEventListener("scroll", handleScroll)
    }
  }, [scrollContainerRef, threshold, throttleMs, onNearTop, onNearBottom])
}
