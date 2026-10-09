import { t } from "@lingui/core/macro"
import { useEffect, useSyncExternalStore } from "react"

import { api, getErrorMessage, type NotificationSubscription, type ProviderInfo } from "@/lib/api"

interface ProvidersSnapshot {
  providers: ProviderInfo[]
  error: string | null
}

// One list per window, shared by every consumer.
let snapshot: ProvidersSnapshot = { providers: [], error: null }
let generation = 0
let loading: Promise<void> | null = null
let changes: NotificationSubscription | null = null
const listeners = new Set<() => void>()

function load(): Promise<void> {
  const request = ++generation
  loading = api.providers.list().then(
    (providers) => settle(request, { providers, error: null }),
    (error: unknown) =>
      settle(request, { ...snapshot, error: getErrorMessage(error, t`Failed to load providers`) }),
  )
  return loading
}

function settle(request: number, next: ProvidersSnapshot) {
  if (request !== generation) return
  loading = null
  snapshot = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    // Installing or uninstalling a provider plugin changes the list.
    changes = api.notifications.listen("providers-changed", () => void load())
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      changes?.unlisten()
      changes = null
    }
  }
}

/**
 * Providers renCal can run, with plugin names and icons. Mounting rescans, so a
 * binary installed on `PATH` shows up when a provider list opens; consumers
 * mounting together share one scan.
 */
export function useProviders(): ProvidersSnapshot {
  useEffect(() => {
    if (!loading) void load()
  }, [])
  return useSyncExternalStore(subscribe, () => snapshot)
}
