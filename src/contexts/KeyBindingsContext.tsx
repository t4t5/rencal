import { type ReactNode, useEffect, useMemo, useState } from "react"

import { api, type KeysSnapshot, type UserKeyBinding } from "@/lib/api"
import { type Binding, DEFAULT_BINDINGS, resolveBindings } from "@/lib/key-bindings"
import { logger } from "@/lib/logger"
import { createStrictContext } from "@/lib/strict-context"

import { viewBindings } from "@/views/manifest"
import { useViews } from "@/views/useViews"

interface KeyBindingsContextType {
  bindings: readonly Binding[]
  // Problems in keys.toml ("keys.toml: ..."): it couldn't be read, or an entry was skipped.
  errors: readonly string[]
}

const [KeyBindingsContextProvider, useKeyBindings] =
  createStrictContext<KeyBindingsContextType>("KeyBindings")

export { useKeyBindings }

export function KeyBindingsProvider({ children }: { children: ReactNode }) {
  const views = useViews()
  const [userBindings, setUserBindings] = useState<readonly UserKeyBinding[]>([])
  const [fileError, setFileError] = useState<string | null>(null)

  useEffect(() => {
    // A file that can't be read keeps the last good bindings.
    const apply = (snapshot: KeysSnapshot) => {
      setFileError(snapshot.error)
      if (!snapshot.error) setUserBindings(snapshot.bindings)
    }
    const subscription = api.notifications.listen("keys-changed", apply)
    void subscription.ready
      .then(() => api.keys.get())
      .then(apply)
      .catch((err: unknown) => logger.error("Failed to load keys.toml", err))
    return subscription.unlisten
  }, [])

  const value = useMemo(() => {
    const { bindings, errors } = resolveBindings(
      [...viewBindings(views), ...DEFAULT_BINDINGS],
      userBindings,
    )
    const entryErrors = errors.map((error) => `keys.toml: ${error}`)
    return { bindings, errors: fileError ? [fileError, ...entryErrors] : entryErrors }
  }, [views, userBindings, fileError])

  useEffect(() => {
    for (const error of value.errors) logger.warn(error)
  }, [value.errors])

  return <KeyBindingsContextProvider value={value}>{children}</KeyBindingsContextProvider>
}

// The keys shown for `action` (e.g. in a tooltip): its first listed binding.
export function useActionKeys(action: string): string | undefined {
  const { bindings } = useKeyBindings()
  return bindings.find((binding) => binding.action === action && !binding.hidden)?.keys
}
