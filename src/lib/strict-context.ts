import { createContext, useContext } from "react"

/**
 * Creates a context whose hook throws when no provider is mounted above the
 * caller, instead of silently returning a default.
 */
export function createStrictContext<T>(name: string) {
  const Context = createContext<T | null>(null)
  Context.displayName = name

  function useStrictContext(): T {
    const value = useContext(Context)
    if (value === null) {
      throw new Error(`${name} is unavailable. Wrap the component in ${name}Provider.`)
    }
    return value
  }

  return [Context.Provider, useStrictContext] as const
}
