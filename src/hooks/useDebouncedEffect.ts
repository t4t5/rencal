import { DependencyList, useEffect, useRef } from "react"

export const useDebouncedEffect = (callback: () => void, deps: DependencyList, delay: number) => {
  const isFirstRender = useRef(true)

  useEffect(() => {
    // Skip on first render
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    const timeout = setTimeout(callback, delay)
    return () => clearTimeout(timeout)
  }, deps)
}
