import { DependencyList, useEffect, useRef } from "react"

export const useDebouncedEffect = (callback: () => void, deps: DependencyList, delay: number) => {
  const isFirstRender = useRef(true)
  const pendingCallback = useRef<(() => void) | null>(null)

  useEffect(() => {
    // Skip on first render
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    pendingCallback.current = callback
    const timeout = setTimeout(() => {
      pendingCallback.current = null
      callback()
    }, delay)
    return () => clearTimeout(timeout)
  }, deps)

  // Flush pending callback on unmount
  useEffect(() => {
    return () => {
      pendingCallback.current?.()
    }
  }, [])
}
