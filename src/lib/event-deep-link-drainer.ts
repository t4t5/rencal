import type { CalendarEvent as RpcCalendarEvent, EventDeepLink } from "@/rpc/bindings"

import { rpcToCalendarEvent, type CalendarEvent } from "@/lib/cal-events"

interface EventDeepLinkDrainerOptions {
  takePending: () => Promise<EventDeepLink[]>
  findEvent: (link: EventDeepLink) => Promise<RpcCalendarEvent | null>
  jumpToEvent: (event: CalendarEvent) => Promise<void>
  onNotFound: (link: EventDeepLink) => void
  onError: (error: unknown) => void
}

/** Build a serialized inbox drainer. Every invocation joins the same promise
 * chain, so wake-up bursts cannot race lookup or navigation state. */
export function createEventDeepLinkDrainer({
  takePending,
  findEvent,
  jumpToEvent,
  onNotFound,
  onError,
}: EventDeepLinkDrainerOptions): () => Promise<void> {
  let chain = Promise.resolve()

  return () => {
    const run = chain.then(async () => {
      let links: EventDeepLink[]
      try {
        links = await takePending()
      } catch (error) {
        onError(error)
        return
      }

      for (const link of links) {
        try {
          const found = await findEvent(link)
          if (!found) {
            onNotFound(link)
            continue
          }
          await jumpToEvent(rpcToCalendarEvent(found))
        } catch (error) {
          onError(error)
        }
      }
    })

    // Keep the serialization chain usable even if a consumer callback throws.
    chain = run.catch(() => undefined)
    return run
  }
}
