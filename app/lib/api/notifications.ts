import { Backend } from "rencal/native"

import type { AppEvent, AppEventName, AppEventPayload } from "@/rpc/events.generated"

export type NotificationSubscription = { ready: Promise<void>; unlisten: () => void }

type Listener = (payload: unknown) => void

// One subscription to the backend, fanned out here: frontend broadcasts reach
// the same listeners.
const listeners = new Map<string, Set<Listener>>()
let subscribed = false

function deliver(name: string, payload: unknown) {
  for (const listener of listeners.get(name) ?? []) listener(payload)
}

export function listenNotification<N extends AppEventName>(
  name: N,
  handler: (payload: AppEventPayload<N>) => void,
): NotificationSubscription {
  if (!subscribed) {
    subscribed = true
    void Backend.onEvent(deliver)
  }
  const listener = handler as Listener
  const group = listeners.get(name) ?? new Set<Listener>()
  listeners.set(name, group.add(listener))
  return { ready: Promise.resolve(), unlisten: () => void group.delete(listener) }
}

/** A later launch asked for the window. It's the host's own, so not an `AppEvent`. */
export function listenFocusWindow(handler: () => void): NotificationSubscription {
  return listenNotification("focus-window" as AppEventName, handler)
}

type FrontendEvent = Extract<AppEvent, { name: "theme-changed" | "rencal-config-changed" }>
type EmitArgs<E = FrontendEvent> = E extends { name: infer N; payload: infer P }
  ? P extends null
    ? [name: N, payload?: P]
    : [name: N, payload: P]
  : never

// Frontend broadcasts are a host mechanism and are intentionally absent from
// the public client. A union of tuples preserves name/payload correlation.
export function emitAppEvent(...[name, payload]: EmitArgs): Promise<void> {
  deliver(name, payload ?? null)
  return Promise.resolve()
}

export const notifications = { listen: listenNotification } as const
