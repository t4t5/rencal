import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event"

import type { AppEvent, AppEventName, AppEventPayload } from "@/rpc/events.generated"

// Synchronous cleanup also handles registration completing after unmount.
// `ready` lets inbox consumers wait for registration before their initial drain.
export function listenAppEvent<N extends AppEventName>(
  name: N,
  handler: (payload: AppEventPayload<N>) => void,
): { ready: Promise<void>; unlisten: UnlistenFn } {
  let disposed = false
  let stop: UnlistenFn | undefined
  const ready = listen<AppEventPayload<N>>(name, (event) => {
    if (!disposed) handler(event.payload)
  }).then((unlisten) => {
    if (disposed) unlisten()
    else stop = unlisten
  })
  return {
    ready,
    unlisten: () => {
      disposed = true
      stop?.()
      stop = undefined
    },
  }
}

type FrontendEvent = Extract<AppEvent, { name: "theme-changed" | "rencal-config-changed" }>
type EmitArgs<E = FrontendEvent> = E extends { name: infer N; payload: infer P }
  ? P extends null
    ? [name: N, payload?: P]
    : [name: N, payload: P]
  : never

// A union of tuples preserves name/payload correlation even for union callers.
export function emitAppEvent(...[name, payload]: EmitArgs): Promise<void> {
  return emit(name, payload ?? null)
}
